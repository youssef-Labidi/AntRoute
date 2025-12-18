# AntRoute Simulator for TSYP RAS x VTS Challange

A sophisticated **decentralized multi-agent delivery system simulation** that demonstrates autonomous agents coordinating using swarm intelligence principles. This React-based visualization shows how delivery robots/drones can work together without centralized control.

## 🚀 Features

### Core Simulation
- **Multi-Agent System**: Up to 10 autonomous agents navigating a grid environment
- **Decentralized Coordination**: Agents use auctions and pheromone trails for task allocation
- **A* Pathfinding**: Intelligent navigation with pheromone-influenced routing
- **Real-time Visualization**: Canvas-based rendering with agent states and paths

### Advanced Capabilities
- **Failure Recovery**: Automatic task reassignment when agents fail
- **Dynamic Scenarios**: Multiple simulation scenarios (normal, peak load, stress testing)
- **Performance Metrics**: Real-time KPIs including delivery times, energy efficiency, and workload fairness
- **Swarm Intelligence**: Pheromone-based coordination mimicking ant colony behavior

### Interactive Controls
- **Simulation Controls**: Play/pause, reset, and step-through functionality
- **Dynamic Task Management**: Add delivery requests during simulation
- **Failure Injection**: Test system resilience by forcing agent failures
- **Scenario Selection**: Choose from predefined simulation scenarios

## 🎯 What This Demonstrates

This simulator showcases concepts from:
- **Multi-Agent Systems (MAS)**
- **Swarm Intelligence**
- **Decentralized Task Allocation**
- **Fault-Tolerant Systems**
- **Auction-Based Coordination**
- **Bio-Inspired Algorithms**

## 🔧 Technical Implementation

### Agent Intelligence
- **Utility-Based Bidding**: Agents calculate task utility based on distance, energy, and workload
- **Pheromone Trails**: Virtual chemical markers guide path optimization
- **Energy Management**: Agents monitor and manage their energy consumption
- **Failure Detection**: Beacon-based system detects and handles agent failures

### Algorithms
- **A* Pathfinding**: Optimized route finding with pheromone influence
- **Auction Protocol**: Distributed task allocation mechanism
- **Gini Coefficient**: Workload fairness measurement
- **Failure Recovery**: Automatic task reassignment protocols

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm

### Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Usage
1. **Start Simulation**: Click the Play button to begin
2. **Add Tasks**: Use "Add Request" to create delivery missions
3. **Test Resilience**: Use "Inject Failure" to test recovery mechanisms
4. **Monitor Performance**: Watch real-time metrics in the KPI panel
5. **Experiment**: Try different scenarios and auto-spawn settings

## 📊 Performance Metrics

- **On-Time Rate (OTR)**: Percentage of deliveries completed successfully
- **Gini Coefficient**: Measures workload fairness (0 = perfect equality)
- **Average Energy**: Fleet energy efficiency
- **Message Count**: Communication overhead
- **Failure Recoveries**: System resilience indicator

## 🎮 Simulation Controls

### Scenarios
- **Normal**: Standard operation with 6 agents
- **Small**: Limited fleet with 4 agents
- **Large**: Extended fleet with 10 agents  
- **Peak**: High-frequency task generation
- **Stress**: Maximum load testing

### Visual Elements
- **Colored Circles**: Agents with unique IDs and energy levels
- **Yellow Dots**: Pickup locations
- **Green Dots**: Dropoff locations
- **Purple Overlay**: Pheromone concentration
- **Blue Circles**: Communication ranges
- **Dotted Lines**: Planned agent paths

## 🔬 Research Applications

This simulator can be used to study:
- **Logistics Optimization**
- **Distributed Computing Concepts**
- **Emergent Behavior in Multi-Agent Systems**
- **Fault-Tolerant System Design**
- **Bio-Inspired Algorithm Performance**

## 🛠 Built With

- **React 18** - UI framework
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **HTML5 Canvas** - Visualization
- **Vite** - Build tool

## 🔄 System Architecture

The simulation operates on several key principles:

1. **Decentralized Decision Making**: No central coordinator
2. **Emergent Coordination**: Complex behavior from simple rules
3. **Adaptive Pathfinding**: Routes improve over time via pheromones
4. **Fault Tolerance**: System continues operating despite failures
5. **Load Balancing**: Automatic workload distribution

## 🎯 Future Enhancements

- Multiple depot support
- Dynamic obstacle generation
- Machine learning integration
- Network topology variations
- Real-time collaboration features
