const WebSocket = require('ws');
const http = require('http');
const os = require('os');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HiveRoute WebSocket Server is running!\n');
});

const wss = new WebSocket.Server({ server });

const robots = new Map();
const robotStatus = new Map();
const dashboards = new Map();
const activeAuctions = new Map();
const pendingTasks = [];

function getNetworkAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          address: net.address
        });
      }
    }
  }
  return addresses;
}

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`\n[CONNECTION] New client from ${clientIP}`);
  
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (error) {
      console.error('[ERROR] Message parse failed:', error.message);
    }
  });
  
  ws.on('close', () => {
    for (const [id, client] of robots.entries()) {
      if (client === ws) {
        robots.delete(id);
        robotStatus.delete(id);
        console.log(`[DISCONNECT] Robot ${id} disconnected`);
        broadcast({ type: 'robot_disconnected', robotId: id });
        break;
      }
    }
    
    for (const [id, client] of dashboards.entries()) {
      if (client === ws) {
        dashboards.delete(id);
        console.log(`[DISCONNECT] Dashboard ${id} disconnected`);
        break;
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('[ERROR] WebSocket error:', error.message);
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'robot_register':
      robots.set(message.robotId, ws);
      robotStatus.set(message.robotId, { 
        busy: false, 
        currentTask: null,
        pendingAuctions: new Set() // Track which auctions this robot is participating in
      });
      console.log(`[REGISTER] Robot ${message.robotId} registered (Total: ${robots.size})`);
      broadcast({ 
        type: 'robot_connected', 
        robotId: message.robotId,
        timestamp: Date.now()
      });
      
      // Process pending tasks if any
      setTimeout(() => processPendingTasks(), 500);
      break;
      
    case 'dashboard_register':
      const dashId = message.dashboardId || `dash_${Date.now()}`;
      dashboards.set(dashId, ws);
      console.log(`[REGISTER] Dashboard ${dashId} registered`);
      
      ws.send(JSON.stringify({
        type: 'robot_list',
        robots: Array.from(robots.keys())
      }));
      break;
      
    case 'auction_start':
      console.log(`\n[AUCTION] 📢 NEW TASK: ${message.auctionId.slice(-8)}`);
      
      // Count idle robots (not busy and not already assigned to a pending auction)
      let availableRobots = [];
      console.log('[STATUS] Robot states:');
      robotStatus.forEach((status, robotId) => {
        const state = status.busy ? '🚚 BUSY' : '💤 IDLE';
        console.log(`  - ${robotId}: ${state}${status.pendingAuctions.size > 0 ? ` (${status.pendingAuctions.size} pending auctions)` : ''}`);
        if (!status.busy) {
          availableRobots.push(robotId);
        }
      });
      
      // If no idle robots, queue the task
      if (availableRobots.length === 0) {
        console.log(`[QUEUE] ⏸️ All robots busy - adding to pending queue`);
        pendingTasks.push({
          auctionId: message.auctionId,
          task: message.task
        });
        console.log(`[QUEUE] ${pendingTasks.length} task(s) waiting in queue\n`);
        
        broadcastToDashboards({
          type: 'task_queued',
          auctionId: message.auctionId,
          task: message.task,
          queuePosition: pendingTasks.length
        });
        return;
      }
      
      console.log(`[AUCTION] ${availableRobots.length} available robot(s)`);
      
      // Mark all available robots as participating in this auction
      availableRobots.forEach(robotId => {
        const status = robotStatus.get(robotId);
        if (status) {
          status.pendingAuctions.add(message.auctionId);
        }
      });
      
      activeAuctions.set(message.auctionId, {
        task: message.task,
        bids: new Map(),
        startTime: Date.now(),
        resolved: false
      });
      
      broadcastToRobots(message);
      broadcastToDashboards(message);
      
      // Resolve after 2 seconds
      setTimeout(() => {
        resolveAuction(message.auctionId);
      }, 2000);
      break;
      
    case 'auction_bid':
      const auction = activeAuctions.get(message.auctionId);
      if (auction && !auction.resolved) {
        // Check if robot is still available (not busy)
        const status = robotStatus.get(message.robotId);
        if (status && status.busy) {
          console.log(`[BID] ⏭️ Ignoring bid from busy robot ${message.robotId}`);
          return;
        }
        
        console.log(`[BID] ${message.robotId}: ${message.bid.toFixed(2)}`);
        auction.bids.set(message.robotId, message.bid);
        broadcastToDashboards(message);
      }
      break;
      
    case 'robot_position':
    case 'pheromone_deposit':
      broadcastToDashboards(message);
      break;
      
    case 'task_complete':
      console.log(`\n[TASK] ✅ ${message.robotId} completed ${message.taskId.slice(-8)}`);
      const status = robotStatus.get(message.robotId);
      
      if (status) {
        status.busy = false;
        status.currentTask = null;
        console.log(`[STATUS] ${message.robotId} is now 💤 IDLE`);
        
        // Process pending tasks after a brief delay
        setTimeout(() => processPendingTasks(), 500);
      }
      
      broadcastToDashboards(message);
      break;
  }
}

function processPendingTasks() {
  if (pendingTasks.length === 0) return;
  
  // Count idle robots (not busy and not in pending auctions)
  let availableRobots = [];
  robotStatus.forEach((status, robotId) => {
    if (!status.busy) {
      availableRobots.push(robotId);
    }
  });
  
  if (availableRobots.length === 0) {
    console.log(`[QUEUE] No idle robots available yet (${pendingTasks.length} tasks waiting)`);
    return;
  }
  
  console.log(`\n[QUEUE] 📋 Processing pending tasks (${pendingTasks.length} waiting, ${availableRobots.length} idle robots)`);
  
  // Process as many tasks as we have idle robots
  const tasksToProcess = Math.min(pendingTasks.length, availableRobots.length);
  
  for (let i = 0; i < tasksToProcess; i++) {
    const task = pendingTasks.shift();
    console.log(`[QUEUE] ▶️ Starting auction for queued task ${task.auctionId.slice(-8)}`);
    
    // Mark robots as participating
    availableRobots.forEach(robotId => {
      const status = robotStatus.get(robotId);
      if (status && !status.busy) {
        status.pendingAuctions.add(task.auctionId);
      }
    });
    
    activeAuctions.set(task.auctionId, {
      task: task.task,
      bids: new Map(),
      startTime: Date.now(),
      resolved: false
    });
    
    const auctionMessage = {
      type: 'auction_start',
      auctionId: task.auctionId,
      task: task.task
    };
    
    broadcastToRobots(auctionMessage);
    broadcastToDashboards(auctionMessage);
    
    // Stagger the resolution times slightly for multiple tasks
    setTimeout(() => {
      resolveAuction(task.auctionId);
    }, 2000 + (i * 300));
  }
  
  if (pendingTasks.length > 0) {
    console.log(`[QUEUE] ${pendingTasks.length} task(s) still waiting`);
  }
}

function resolveAuction(auctionId) {
  const auction = activeAuctions.get(auctionId);
  
  if (!auction || auction.resolved) {
    return;
  }
  
  auction.resolved = true; // Mark as resolved immediately
  
  console.log(`\n[AUCTION] ⚖️ RESOLVING ${auctionId.slice(-8)}`);
  console.log(`[AUCTION] Received ${auction.bids.size} bid(s)`);
  
  if (auction.bids.size === 0) {
    console.log(`[AUCTION] ❌ NO BIDS - adding back to queue`);
    
    // Clear pending auction status from all robots
    robotStatus.forEach((status) => {
      status.pendingAuctions.delete(auctionId);
    });
    
    pendingTasks.push({
      auctionId: auctionId,
      task: auction.task
    });
    activeAuctions.delete(auctionId);
    
    // Retry in 3 seconds
    setTimeout(() => processPendingTasks(), 3000);
    return;
  }
  
  // Find lowest bid from AVAILABLE robots only
  let winnerId = null;
  let lowestBid = Infinity;
  
  console.log(`[AUCTION] Evaluating bids:`);
  for (const [robotId, bid] of auction.bids) {
    const status = robotStatus.get(robotId);
    
    // Skip if robot became busy during the auction
    if (status && status.busy) {
      console.log(`  ⏭️ ${robotId}: ${bid.toFixed(2)} (NOW BUSY - skipping)`);
      continue;
    }
    
    const isWinning = bid < lowestBid;
    console.log(`  ${isWinning ? '✅' : '  '} ${robotId}: ${bid.toFixed(2)}`);
    
    if (isWinning) {
      lowestBid = bid;
      winnerId = robotId;
    }
  }
  
  if (!winnerId) {
    console.log(`[AUCTION] ❌ No available robots found - adding back to queue`);
    
    // Clear pending auction status
    robotStatus.forEach((status) => {
      status.pendingAuctions.delete(auctionId);
    });
    
    pendingTasks.push({
      auctionId: auctionId,
      task: auction.task
    });
    activeAuctions.delete(auctionId);
    setTimeout(() => processPendingTasks(), 3000);
    return;
  }
  
  console.log(`\n[AUCTION] 🏆 WINNER: ${winnerId} (bid: ${lowestBid.toFixed(2)})`);
  
  const winnerStatus = robotStatus.get(winnerId);
  
  if (winnerStatus) {
    winnerStatus.busy = true;
    winnerStatus.currentTask = auctionId;
    winnerStatus.pendingAuctions.delete(auctionId); // Remove from pending
    console.log(`[STATUS] ${winnerId} is now 🚚 BUSY with ${auctionId.slice(-8)}`);
  }
  
  // Clear this auction from all other robots' pending lists
  robotStatus.forEach((status, robotId) => {
    if (robotId !== winnerId) {
      status.pendingAuctions.delete(auctionId);
    }
  });
  
  const winnerMessage = {
    type: 'auction_winner',
    auctionId: auctionId,
    winnerId: winnerId,
    winningBid: lowestBid,
    task: auction.task
  };
  
  broadcast(winnerMessage);
  
  setTimeout(() => {
    activeAuctions.delete(auctionId);
  }, 1000);
  
  console.log('\n[STATUS] Updated robot states:');
  robotStatus.forEach((status, robotId) => {
    const state = status.busy ? '🚚 BUSY' : '💤 IDLE';
    console.log(`  - ${robotId}: ${state}${status.pendingAuctions.size > 0 ? ` (${status.pendingAuctions.size} pending)` : ''}`);
  });
  
  if (pendingTasks.length > 0) {
    console.log(`[QUEUE] ${pendingTasks.length} task(s) still in queue\n`);
  }
}

function broadcast(message) {
  const data = JSON.stringify(message);
  
  robots.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  
  dashboards.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function broadcastToRobots(message) {
  const data = JSON.stringify(message);
  robots.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function broadcastToDashboards(message) {
  const data = JSON.stringify(message);
  dashboards.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

const PORT = 8081;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   HiveRoute WebSocket Server Active   ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`📡 Port ${PORT}\n`);
  
  const addresses = getNetworkAddresses();
  addresses.forEach(({ interface: iface, address }) => {
    console.log(`   ${iface}: ws://${address}:${PORT}`);
  });
  
  console.log('\n✅ Ready!\n');
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);