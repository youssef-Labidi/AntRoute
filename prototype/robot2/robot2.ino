#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ============== CONFIGURATION ==============
#define ROBOT_ID "R2"  // ← CHANGE TO "R2" FOR SECOND ROBOT

const char* WIFI_SSID = "Youssef's A36";
const char* WIFI_PASSWORD = "01020304";
const char* WS_HOST = "10.165.83.107";
const int WS_PORT = 8081;

// Motor Pins
#define MOTOR_LEFT_PWM 25
#define MOTOR_LEFT_DIR1 26
#define MOTOR_LEFT_DIR2 27
#define MOTOR_RIGHT_PWM 32
#define MOTOR_RIGHT_DIR1 33
#define MOTOR_RIGHT_DIR2 14

// Configuration
#define WHEEL_DIAMETER_CM 4.0
#define WHEEL_BASE_CM 15.0
#define ESTIMATED_SPEED_CM_PER_SEC 15.0

// State Variables
WebSocketsClient webSocket;

struct Position {
  float x;
  float y;
} currentPos = {100, 100};

float currentHeading = 0;
float energy = 100.0;
bool isMoving = false;
bool isBusy = false;

unsigned long lastMotorUpdate = 0;
int currentLeftSpeed = 0;
int currentRightSpeed = 0;

String currentTask = "";
Position targetPos = {0, 0};
Position dropoffPos = {0, 0};
bool hasPickedUp = false;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Set different starting positions
  String robotIdStr = String(ROBOT_ID);
  if (robotIdStr == "R1") {
    currentPos.x = 20;
    currentPos.y = 20;
    currentHeading = 45;
  } else if (robotIdStr == "R2") {
    currentPos.x = 180;
    currentPos.y = 180;
    currentHeading = 225;
  }
  
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║    HiveRoute Robot Starting...        ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.printf("\n[CONFIG] Robot ID: %s\n", ROBOT_ID);
  Serial.printf("[CONFIG] Start: (%.1f, %.1f) @ %.0f°\n", currentPos.x, currentPos.y, currentHeading);

  randomSeed(analogRead(0) + millis());

  pinMode(MOTOR_LEFT_PWM, OUTPUT);
  pinMode(MOTOR_LEFT_DIR1, OUTPUT);
  pinMode(MOTOR_LEFT_DIR2, OUTPUT);
  pinMode(MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR1, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR2, OUTPUT);
  
  stopMotors();

  connectWiFi();
  
  webSocket.begin(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  Serial.println("\n[BOOT] ✅ Setup complete!");
  Serial.println("[STATUS] 💤 IDLE - Ready for tasks\n");
  
  lastMotorUpdate = millis();
}

// ============== WIFI ==============
void connectWiFi() {
  Serial.printf("\n[WiFi] Connecting to '%s'", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✅ Connected!");
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] ❌ Failed!");
  }
}

// ============== WEBSOCKET ==============
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("\n[WS] ❌ Disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.println("\n[WS] ✅ Connected!");
      registerRobot();
      break;
      
    case WStype_TEXT:
      handleMessage((char*)payload);
      break;
  }
}

void registerRobot() {
  StaticJsonDocument<200> doc;
  doc["type"] = "robot_register";
  doc["robotId"] = ROBOT_ID;
  
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
  
  Serial.printf("[WS] Registered as %s\n", ROBOT_ID);
}

void handleMessage(char* payload) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload);
  
  if (error) {
    Serial.printf("[WS] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  const char* type = doc["type"];
  
  if (strcmp(type, "auction_start") == 0) {
    handleAuctionStart(doc);
  } 
  else if (strcmp(type, "auction_winner") == 0) {
    handleAuctionWinner(doc);
  }
  else if (strcmp(type, "robot_connected") == 0) {
    Serial.printf("[INFO] Robot %s connected\n", doc["robotId"].as<const char*>());
  }
}

// ============== AUCTION - ALWAYS BID ==============
void handleAuctionStart(JsonDocument& doc) {
  // CRITICAL FIX: ALWAYS BID, even if busy!
  // The server will decide if we can win based on our status
  
  String auctionId = doc["auctionId"].as<String>();
  
  JsonObject task = doc["task"];
  float pickup_x = task["pickup"]["x"];
  float pickup_y = task["pickup"]["y"];
  
  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║      📢 NEW AUCTION RECEIVED      ║");
  Serial.println("╚════════════════════════════════════╝");
  Serial.printf("[AUCTION] ID: %s\n", auctionId.c_str());
  Serial.printf("[AUCTION] Status: %s\n", isBusy ? "🚚 BUSY" : "💤 IDLE");
  
  float distance = sqrt(pow(pickup_x - currentPos.x, 2) + 
                       pow(pickup_y - currentPos.y, 2));
  
  // Add randomness for fair distribution
  float randomFactor = (random(0, 200) / 100.0 - 1.0) * 8.0;
  float energyFactor = (100 - energy) * 0.2;
  float bid = distance + energyFactor + randomFactor;
  
  Serial.printf("[AUCTION] My Pos: (%.1f, %.1f)\n", currentPos.x, currentPos.y);
  Serial.printf("[AUCTION] Target: (%.1f, %.1f)\n", pickup_x, pickup_y);
  Serial.printf("[AUCTION] Distance: %.1f cm\n", distance);
  Serial.printf("[AUCTION] BID: %.2f\n", bid);
  
  if (isBusy) {
    Serial.println("[AUCTION] Note: I'm busy, server will handle queueing\n");
  }
  
  StaticJsonDocument<256> bidDoc;
  bidDoc["type"] = "auction_bid";
  bidDoc["auctionId"] = auctionId;
  bidDoc["robotId"] = ROBOT_ID;
  bidDoc["bid"] = bid;
  
  String output;
  serializeJson(bidDoc, output);
  webSocket.sendTXT(output);
  
  Serial.println("[AUCTION] ✅ Bid submitted!");
}

void handleAuctionWinner(JsonDocument& doc) {
  String winnerId = doc["winnerId"];
  String auctionId = doc["auctionId"].as<String>();
  
  if (winnerId == ROBOT_ID) {
    // Check if we're actually idle
    if (isBusy || currentTask != "") {
      Serial.println("\n[AUCTION] 🎉 WON - But already busy!");
      Serial.println("[AUCTION] ⚠️ Server error - rejecting task\n");
      return;
    }
    
    Serial.println("\n╔════════════════════════════════════╗");
    Serial.println("║      🎉 WE WON THE AUCTION! 🎉    ║");
    Serial.println("╚════════════════════════════════════╝");
    
    JsonObject task = doc["task"];
    targetPos.x = task["pickup"]["x"];
    targetPos.y = task["pickup"]["y"];
    dropoffPos.x = task["dropoff"]["x"];
    dropoffPos.y = task["dropoff"]["y"];
    
    // Set ALL busy flags
    currentTask = auctionId;
    isMoving = true;
    isBusy = true;
    hasPickedUp = false;
    
    Serial.printf("[TASK] ID: %s\n", currentTask.c_str());
    Serial.printf("[TASK] 🎯 Pickup: (%.1f, %.1f)\n", targetPos.x, targetPos.y);
    Serial.printf("[TASK] 🎯 Dropoff: (%.1f, %.1f)\n", dropoffPos.x, dropoffPos.y);
    Serial.println("[STATUS] 🚚 NOW BUSY\n");
  } else {
    Serial.printf("[AUCTION] ❌ Lost to %s\n", winnerId.c_str());
    if (isBusy) {
      Serial.println("[AUCTION] (I was busy anyway)\n");
    } else {
      Serial.println("[AUCTION] 💤 Still IDLE - Ready for next auction\n");
    }
  }
}

// ============== POSITION UPDATE ==============
void updatePosition() {
  unsigned long now = millis();
  float deltaTime = (now - lastMotorUpdate) / 1000.0;
  lastMotorUpdate = now;
  
  if (deltaTime > 0.5 || deltaTime <= 0) return;
  
  float leftSpeedRatio = abs(currentLeftSpeed) / 255.0;
  float rightSpeedRatio = abs(currentRightSpeed) / 255.0;
  
  float leftSpeed = leftSpeedRatio * ESTIMATED_SPEED_CM_PER_SEC * (currentLeftSpeed >= 0 ? 1 : -1);
  float rightSpeed = rightSpeedRatio * ESTIMATED_SPEED_CM_PER_SEC * (currentRightSpeed >= 0 ? 1 : -1);
  
  float distLeft = leftSpeed * deltaTime;
  float distRight = rightSpeed * deltaTime;
  
  float distCenter = (distLeft + distRight) / 2.0;
  float deltaHeading = (distRight - distLeft) / WHEEL_BASE_CM;
  
  currentHeading += deltaHeading * 180.0 / PI;
  
  while (currentHeading >= 360) currentHeading -= 360;
  while (currentHeading < 0) currentHeading += 360;
  
  float headingRad = currentHeading * PI / 180.0;
  currentPos.x += distCenter * cos(headingRad);
  currentPos.y += distCenter * sin(headingRad);
  
  currentPos.x = constrain(currentPos.x, 0, 200);
  currentPos.y = constrain(currentPos.y, 0, 200);
}

// ============== NAVIGATION ==============
void navigateToTarget() {
  float dx = targetPos.x - currentPos.x;
  float dy = targetPos.y - currentPos.y;
  float distance = sqrt(dx * dx + dy * dy);
  
  if (distance < 8.0) {
    if (!hasPickedUp) {
      Serial.println("\n[NAV] ✅ Pickup reached!");
      Serial.println("[NAV] 📦 Package picked up!");
      hasPickedUp = true;
      targetPos = dropoffPos;
      Serial.printf("[NAV] 🎯 Going to dropoff: (%.1f, %.1f)\n\n", targetPos.x, targetPos.y);
      return;
    } else {
      Serial.println("\n[NAV] ✅ Dropoff reached!");
      Serial.println("[NAV] 📦 Package delivered!");
      stopMotors();
      completeTask();
      return;
    }
  }
  
  float targetHeading = atan2(dy, dx) * 180.0 / PI;
  if (targetHeading < 0) targetHeading += 360;
  
  float headingError = targetHeading - currentHeading;
  if (headingError > 180) headingError -= 360;
  if (headingError < -180) headingError += 360;
  
  if (abs(headingError) > 20) {
    headingError > 0 ? turnLeft() : turnRight();
  } else if (abs(headingError) > 8) {
    headingError > 0 ? moveForwardLeft() : moveForwardRight();
  } else {
    moveForward();
  }
}

void completeTask() {
  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║       ✅ TASK COMPLETED! ✅        ║");
  Serial.println("╚════════════════════════════════════╝");
  Serial.printf("[TASK] Finished: %s\n", currentTask.c_str());
  
  StaticJsonDocument<256> doc;
  doc["type"] = "task_complete";
  doc["robotId"] = ROBOT_ID;
  doc["taskId"] = currentTask;
  
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
  
  // Clear ALL busy flags
  currentTask = "";
  isMoving = false;
  isBusy = false;
  hasPickedUp = false;
  
  energy = min(100.0f, energy + 10.0f);
  
  Serial.println("[STATUS] 💤 IDLE - Ready for new tasks\n");
}

void sendPositionUpdate() {
  StaticJsonDocument<256> doc;
  doc["type"] = "robot_position";
  doc["robotId"] = ROBOT_ID;
  doc["position"]["x"] = currentPos.x;
  doc["position"]["y"] = currentPos.y;
  doc["heading"] = currentHeading;
  doc["energy"] = energy;
  
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

void depositPheromone() {
  StaticJsonDocument<256> doc;
  doc["type"] = "pheromone_deposit";
  doc["robotId"] = ROBOT_ID;
  doc["position"]["x"] = currentPos.x;
  doc["position"]["y"] = currentPos.y;
  doc["intensity"] = 1.0;
  
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

// ============== MOTOR CONTROL ==============
void moveForward() {
  digitalWrite(MOTOR_LEFT_DIR1, HIGH);
  digitalWrite(MOTOR_LEFT_DIR2, LOW);
  analogWrite(MOTOR_LEFT_PWM, 200);
  digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
  digitalWrite(MOTOR_RIGHT_DIR2, LOW);
  analogWrite(MOTOR_RIGHT_PWM, 200);
  currentLeftSpeed = currentRightSpeed = 200;
}

void moveForwardLeft() {
  digitalWrite(MOTOR_LEFT_DIR1, HIGH);
  digitalWrite(MOTOR_LEFT_DIR2, LOW);
  analogWrite(MOTOR_LEFT_PWM, 140);
  digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
  digitalWrite(MOTOR_RIGHT_DIR2, LOW);
  analogWrite(MOTOR_RIGHT_PWM, 200);
  currentLeftSpeed = 140; 
  currentRightSpeed = 200;
}

void moveForwardRight() {
  digitalWrite(MOTOR_LEFT_DIR1, HIGH);
  digitalWrite(MOTOR_LEFT_DIR2, LOW);
  analogWrite(MOTOR_LEFT_PWM, 200);
  digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
  digitalWrite(MOTOR_RIGHT_DIR2, LOW);
  analogWrite(MOTOR_RIGHT_PWM, 140);
  currentLeftSpeed = 200; 
  currentRightSpeed = 140;
}

void turnLeft() {
  digitalWrite(MOTOR_LEFT_DIR1, LOW);
  digitalWrite(MOTOR_LEFT_DIR2, HIGH);
  analogWrite(MOTOR_LEFT_PWM, 150);
  digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
  digitalWrite(MOTOR_RIGHT_DIR2, LOW);
  analogWrite(MOTOR_RIGHT_PWM, 150);
  currentLeftSpeed = -150; 
  currentRightSpeed = 150;
}

void turnRight() {
  digitalWrite(MOTOR_LEFT_DIR1, HIGH);
  digitalWrite(MOTOR_LEFT_DIR2, LOW);
  analogWrite(MOTOR_LEFT_PWM, 150);
  digitalWrite(MOTOR_RIGHT_DIR1, LOW);
  digitalWrite(MOTOR_RIGHT_DIR2, HIGH);
  analogWrite(MOTOR_RIGHT_PWM, 150);
  currentLeftSpeed = 150; 
  currentRightSpeed = -150;
}

void stopMotors() {
  analogWrite(MOTOR_LEFT_PWM, 0);
  analogWrite(MOTOR_RIGHT_PWM, 0);
  currentLeftSpeed = currentRightSpeed = 0;
}

// ============== MAIN LOOP ==============
void loop() {
  webSocket.loop();
  
  static unsigned long lastPositionUpdate = 0;
  if (millis() - lastPositionUpdate > 50) {
    updatePosition();
    lastPositionUpdate = millis();
  }
  
  if (isBusy && currentTask != "") {
    navigateToTarget();
  } else {
    stopMotors();
  }
  
  static unsigned long lastPositionSend = 0;
  if (millis() - lastPositionSend > 500) {
    sendPositionUpdate();
    lastPositionSend = millis();
  }
  
  static unsigned long lastPheromone = 0;
  if (millis() - lastPheromone > 200) {
    if (abs(currentLeftSpeed) > 0 || abs(currentRightSpeed) > 0) {
      depositPheromone();
    }
    lastPheromone = millis();
  }
  
  static unsigned long lastEnergyUpdate = 0;
  if (millis() - lastEnergyUpdate > 1000) {
    if (isMoving && energy > 0) {
      energy -= 0.5;
    } else if (energy < 100) {
      energy += 0.1;
    }
    lastEnergyUpdate = millis();
  }
  
  static unsigned long lastDebug = 0;
  if (millis() - lastDebug > 5000) {
    Serial.printf("[DEBUG] Pos:(%.1f,%.1f) H:%.0f° E:%.0f%% Status:%s\n",
      currentPos.x, currentPos.y, currentHeading, energy,
      isBusy ? "🚚BUSY" : "💤IDLE");
    lastDebug = millis();
  }
}