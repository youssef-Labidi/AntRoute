import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, Activity, TrendingUp, Radio, Package, Users } from 'lucide-react';

const CONFIG = {
  GRID_SIZE: 80,
  CELL_SIZE: 10,
  PHEROMONE_DECAY: 0.98,
  PHEROMONE_STRENGTH: 10
};

const AGENT_TYPES = {
  ROBOT: { name: 'Robot', icon: '🤖', speed: 1.5, capacity: 5, energyConsumption: 0.03, color: '#3b82f6', size: 6, needsRoad: true },
  TRUCK: { name: 'Truck', icon: '🚚', speed: 2.2, capacity: 20, energyConsumption: 0.08, color: '#f59e0b', size: 8, needsRoad: true },
  DRONE: { name: 'Drone', icon: '🚁', speed: 3.0, capacity: 3, energyConsumption: 0.15, color: '#8b5cf6', size: 7, needsRoad: false }
};

const PACKAGE_TYPES = [
  { name: 'Small', weight: 2, priority: 'Low', icon: '📦' },
  { name: 'Medium', weight: 5, priority: 'Medium', icon: '📫' },
  { name: 'Large', weight: 8, priority: 'High', icon: '📮' },
  { name: 'Heavy', weight: 12, priority: 'Medium', icon: '🎁' },
  { name: 'X-Large', weight: 18, priority: 'Low', icon: '📦' }
];

const distance = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
const manhattanDist = (p1, p2) => Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);

class GridMap {
  constructor(size) {
    this.size = size;
    this.blocked = new Set();
    this.roads = new Set();
    this.pheromones = new Map();
    this.generateUrbanMap();
  }

  generateUrbanMap() {
    // Define main roads first (horizontal and vertical)
    const roadPositions = [5, 6, 22, 23, 40, 41, 55, 56, 70, 71];
    
    for (let i = 0; i < this.size; i++) {
      roadPositions.forEach(x => {
        if (x < this.size) this.roads.add(`${x},${i}`);
      });
      roadPositions.forEach(y => {
        if (y < this.size) this.roads.add(`${i},${y}`);
      });
    }

    // Define buildings - ensuring they DON'T overlap with roads
    const buildings = [
      {x: 8, y: 8, w: 12, h: 12},    // Top-left block
      {x: 8, y: 24, w: 12, h: 14},   // Left-middle block
      {x: 25, y: 8, w: 13, h: 12},   // Top-center block
      {x: 25, y: 24, w: 13, h: 14},  // Center block
      
      {x: 43, y: 8, w: 10, h: 12},   // Top-right-center
      {x: 43, y: 24, w: 10, h: 14},  // Right-center
      {x: 58, y: 8, w: 10, h: 12},   // Top-right
      {x: 58, y: 24, w: 10, h: 14},  // Right-middle
      
      {x: 8, y: 43, w: 12, h: 10},   // Bottom-left
      {x: 8, y: 58, w: 12, h: 10},   // Bottom-left-bottom
      {x: 25, y: 43, w: 13, h: 10},  // Bottom-center
      {x: 25, y: 58, w: 13, h: 10},  // Bottom-center-bottom
      
      {x: 43, y: 43, w: 10, h: 10},  // Bottom-right-center
      {x: 43, y: 58, w: 10, h: 10},  // Bottom-right-center-bottom
      {x: 58, y: 43, w: 10, h: 10},  // Bottom-right
      {x: 58, y: 58, w: 10, h: 10},  // Bottom-right-bottom
      
      {x: 73, y: 24, w: 5, h: 14},   // Far right
      {x: 73, y: 43, w: 5, h: 10}    // Far right bottom
    ];

    buildings.forEach(b => {
      for (let x = b.x; x < Math.min(b.x + b.w, this.size); x++) {
        for (let y = b.y; y < Math.min(b.y + b.h, this.size); y++) {
          const key = `${x},${y}`;
          // Only add if not a road
          if (!this.roads.has(key)) {
            this.blocked.add(key);
          }
        }
      }
    });
  }

  isBlocked(x, y) { return this.blocked.has(`${x},${y}`); }
  isRoad(x, y) { return this.roads.has(`${x},${y}`); }

  addPheromone(x, y, strength) {
    const key = `${x},${y}`;
    const current = this.pheromones.get(key) || 0;
    this.pheromones.set(key, Math.min(current + strength, 100));
  }

  decayPheromones() {
    for (const [key, value] of this.pheromones.entries()) {
      const newValue = value * CONFIG.PHEROMONE_DECAY;
      if (newValue < 0.5) {
        this.pheromones.delete(key);
      } else {
        this.pheromones.set(key, newValue);
      }
    }
  }

  getPheromone(x, y) {
    return this.pheromones.get(`${x},${y}`) || 0;
  }

  getNeighbors(pos, needsRoad = false) {
    const dirs = [[0,1], [1,0], [0,-1], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]];
    return dirs.map(([dx, dy]) => ({x: pos.x + dx, y: pos.y + dy}))
      .filter(p => {
        if (p.x < 0 || p.x >= this.size || p.y < 0 || p.y >= this.size) return false;
        if (this.isBlocked(p.x, p.y)) return false;
        if (needsRoad && !this.isRoad(p.x, p.y)) return false;
        return true;
      });
  }

  findNearestRoad(pos) {
    const queue = [{...pos}];
    const visited = new Set([`${pos.x},${pos.y}`]);
    
    while (queue.length > 0) {
      const current = queue.shift();
      if (this.isRoad(current.x, current.y)) return {x: current.x, y: current.y};
      
      [[0,1], [1,0], [0,-1], [-1,0]].forEach(([dx, dy]) => {
        const nx = current.x + dx, ny = current.y + dy, key = `${nx},${ny}`;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && !visited.has(key) && !this.isBlocked(nx, ny)) {
          visited.add(key);
          queue.push({x: nx, y: ny});
        }
      });
    }
    return pos;
  }
}

const aStar = (start, goal, map, needsRoad = false) => {
  const openSet = [{pos: start, g: 0, h: manhattanDist(start, goal), f: manhattanDist(start, goal), path: [start]}];
  const closedSet = new Set();
  
  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    
    if (current.pos.x === goal.x && current.pos.y === goal.y) return current.path;
    
    const key = `${current.pos.x},${current.pos.y}`;
    if (closedSet.has(key) || current.path.length > 300) continue;
    closedSet.add(key);
    
    for (const neighbor of map.getNeighbors(current.pos, needsRoad)) {
      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;
      
      const isDiagonal = Math.abs(neighbor.x - current.pos.x) + Math.abs(neighbor.y - current.pos.y) === 2;
      const g = current.g + 1 + (isDiagonal ? 0.4 : 0);
      const h = manhattanDist(neighbor, goal);
      
      // Pheromone influence for road-based agents
      const pheromoneFactor = needsRoad ? map.getPheromone(neighbor.x, neighbor.y) * 0.1 : 0;
      const f = g + h - pheromoneFactor;
      
      openSet.push({ pos: neighbor, g, h, f, path: [...current.path, neighbor] });
    }
  }
  return [start];
};

class Agent {
  constructor(id, pos, map, type) {
    this.id = id;
    this.pos = pos;
    this.type = type;
    this.typeData = AGENT_TYPES[type];
    this.energy = 100;
    this.missionQueue = [];
    this.currentPath = [];
    this.taskCount = 0;
    this.completedTasks = 0;
    this.map = map;
    this.failed = false;
    this.status = 'Idle';
    this.currentPackage = null;
    this.messages = [];
    this.pathIndex = 0;
  }

  addMessage(msg) {
    this.messages.push({ text: msg, time: Date.now() });
    if (this.messages.length > 5) this.messages.shift();
  }

  assignTask(pickup, dropoff, packageInfo) {
    this.missionQueue.push(
      { type: 'pickup', pos: pickup, package: packageInfo },
      { type: 'dropoff', pos: dropoff, package: packageInfo }
    );
    this.taskCount++;
    this.currentPackage = packageInfo;
    this.status = 'En Route to Pickup';
    this.addMessage(`📋 Task assigned: ${packageInfo.name} package (${packageInfo.weight}kg)`);
    this.addMessage(`📍 Heading to pickup at (${pickup.x}, ${pickup.y})`);
    this.planPath();
  }

  planPath() {
    if (this.missionQueue.length === 0) {
      this.currentPath = [];
      this.status = 'Idle';
      this.pathIndex = 0;
      return;
    }
    
    let target = this.missionQueue[0].pos;
    const needsRoad = this.typeData.needsRoad;
    
    if (needsRoad && !this.map.isRoad(target.x, target.y)) {
      target = this.map.findNearestRoad(target);
    }
    
    let startPos = this.pos;
    if (needsRoad && !this.map.isRoad(this.pos.x, this.pos.y)) {
      startPos = this.map.findNearestRoad(this.pos);
      const toRoad = aStar(this.pos, startPos, this.map, false);
      if (toRoad.length > 1) {
        this.currentPath = toRoad;
        this.pathIndex = 0;
        return;
      }
    }
    
    this.currentPath = aStar(startPos, target, this.map, needsRoad);
    this.pathIndex = 0;
    
    if (this.currentPath.length > 1) {
      if (this.missionQueue[0].type === 'pickup') {
        this.status = 'En Route to Pickup';
      } else {
        this.status = 'Delivering Package';
      }
    }
  }

  move() {
    if (this.failed) return;
    
    // Check if reached destination
    if (this.currentPath.length <= 1 || this.pathIndex >= this.currentPath.length - 1) {
      if (this.missionQueue.length > 0) {
        const completed = this.missionQueue.shift();
        if (completed.type === 'pickup') {
          this.addMessage(`✅ Picked up ${completed.package.name} package`);
          this.addMessage(`🚚 Now heading to dropoff at (${this.missionQueue[0].pos.x}, ${this.missionQueue[0].pos.y})`);
          this.status = 'Package Loaded';
          this.currentPackage = completed.package;
        } else if (completed.type === 'dropoff') {
          this.completedTasks++;
          this.addMessage(`🎯 Delivered ${completed.package.name} package successfully!`);
          this.currentPackage = null;
          this.status = 'Task Complete';
        }
        // Important: Plan the next path immediately
        setTimeout(() => this.planPath(), 50);
      } else {
        this.status = 'Idle';
        this.currentPath = [];
        this.pathIndex = 0;
      }
      return;
    }
    
    const moveChance = Math.min(this.typeData.speed / 3.5, 1);
    if (Math.random() < moveChance) {
      this.pathIndex++;
      if (this.pathIndex < this.currentPath.length) {
        this.pos = this.currentPath[this.pathIndex];
        
        // Leave pheromone trail for robots
        if (this.type === 'ROBOT') {
          this.map.addPheromone(this.pos.x, this.pos.y, CONFIG.PHEROMONE_STRENGTH);
        }
        
        this.energy -= this.typeData.energyConsumption;
        if (this.energy <= 0) {
          this.failed = true;
          this.status = 'Out of Energy';
          this.addMessage('⚠️ Energy depleted!');
        }
      }
    }
  }
}

const HiveRouteSimulator = () => {
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [agents, setAgents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const mapRef = useRef(new GridMap(CONFIG.GRID_SIZE));
  const canvasRef = useRef(null);

  useEffect(() => {
    initSimulation();
  }, []);

  const initSimulation = () => {
    const map = mapRef.current;
    map.pheromones.clear();
    const newAgents = [];
    const fleetComposition = [
      { type: 'ROBOT', count: 5 },
      { type: 'TRUCK', count: 4 },
      { type: 'DRONE', count: 6 }
    ];

    let id = 0;
    fleetComposition.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        let x, y, attempts = 0;
        do {
          x = 5 + Math.floor(Math.random() * (CONFIG.GRID_SIZE - 10));
          y = 5 + Math.floor(Math.random() * (CONFIG.GRID_SIZE - 10));
          attempts++;
          if (attempts > 100) break;
        } while (map.isBlocked(x, y) || (AGENT_TYPES[type].needsRoad && !map.isRoad(x, y)));
        
        if (AGENT_TYPES[type].needsRoad && !map.isRoad(x, y)) {
          const roadPos = map.findNearestRoad({x, y});
          x = roadPos.x;
          y = roadPos.y;
        }
        newAgents.push(new Agent(id++, {x, y}, map, type));
      }
    });

    setAgents(newAgents);
    setRequests([]);
    setCompletedCount(0);
    setTime(0);
    setMessages([]);
    setSelectedAgent(null);
  };

  const addRequest = () => {
    const map = mapRef.current;
    const getRandomPos = () => {
      let x, y, attempts = 0;
      do {
        x = Math.floor(Math.random() * CONFIG.GRID_SIZE);
        y = Math.floor(Math.random() * CONFIG.GRID_SIZE);
        attempts++;
      } while ((map.isBlocked(x, y) || map.isRoad(x, y)) && attempts < 100);
      return {x, y};
    };

    const pickup = getRandomPos();
    const dropoff = getRandomPos();
    const packageInfo = PACKAGE_TYPES[Math.floor(Math.random() * PACKAGE_TYPES.length)];

    // Broadcast task to all agents
    const taskId = Date.now();
    setMessages(prev => [...prev, { 
      text: `📢 NEW TASK #${taskId}: ${packageInfo.name} package (${packageInfo.weight}kg) - ${packageInfo.priority} priority`, 
      time: Date.now() 
    }].slice(-10));

    const availableAgents = agents.filter(a => !a.failed && packageInfo.weight <= a.typeData.capacity);
    
    if (availableAgents.length === 0) {
      setMessages(prev => [...prev, { 
        text: `❌ No available agents for ${packageInfo.weight}kg package`, 
        time: Date.now() 
      }].slice(-10));
      return;
    }

    // Bidding process - each agent calculates their bid
    const bids = availableAgents.map(agent => {
      const distToPickup = distance(agent.pos, pickup);
      const energyCost = distToPickup * agent.typeData.energyConsumption;
      const availabilityFactor = agent.missionQueue.length * 5;
      const bidValue = distToPickup + energyCost + availabilityFactor;
      
      // Agent announces bid
      setMessages(prev => [...prev, { 
        text: `🤖 Agent ${agent.id} (${agent.typeData.name}): Bid ${bidValue.toFixed(1)} (dist: ${distToPickup.toFixed(1)}, queue: ${agent.missionQueue.length})`, 
        time: Date.now() 
      }].slice(-10));
      
      return { agent, bidValue };
    });

    // Sort by bid value (lower is better)
    bids.sort((a, b) => a.bidValue - b.bidValue);
    const winner = bids[0].agent;
    
    // Announce winner
    setMessages(prev => [...prev, { 
      text: `🏆 Agent ${winner.id} (${winner.typeData.name}) WON with bid ${bids[0].bidValue.toFixed(1)}`, 
      time: Date.now() 
    }].slice(-10));
    
    // Other agents acknowledge
    bids.slice(1, 3).forEach(bid => {
      setMessages(prev => [...prev, { 
        text: `💬 Agent ${bid.agent.id}: Acknowledged. Standing by.`, 
        time: Date.now() 
      }].slice(-10));
    });

    winner.assignTask(pickup, dropoff, packageInfo);
    
    setMessages(prev => [...prev, { 
      text: `📍 Agent ${winner.id} en route to pickup at (${pickup.x}, ${pickup.y})`, 
      time: Date.now() 
    }].slice(-10));

    setRequests(prev => [...prev, { 
      id: taskId, 
      pickup, 
      dropoff, 
      assignedTo: winner.id,
      package: packageInfo
    }]);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const map = mapRef.current;

    // Draw pheromone trails
    for (const [key, strength] of map.pheromones.entries()) {
      const [x, y] = key.split(',').map(Number);
      const alpha = Math.min(strength / 50, 0.6);
      ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.fillRect(x * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
    }

    // Roads
    ctx.fillStyle = '#1f2937';
    for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
      for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
        if (map.isRoad(x, y)) {
          ctx.fillRect(x * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
        }
      }
    }

    // Buildings
    ctx.fillStyle = '#374151';
    map.blocked.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      ctx.fillRect(x * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
    });

    // Requests
    requests.forEach(req => {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(req.pickup.x * CONFIG.CELL_SIZE + 5, req.pickup.y * CONFIG.CELL_SIZE + 5, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(req.dropoff.x * CONFIG.CELL_SIZE + 5, req.dropoff.y * CONFIG.CELL_SIZE + 5, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Agents
    agents.forEach(agent => {
      const typeData = agent.typeData;
      const isSelected = selectedAgent === agent.id;
      
      // Draw path
      if (agent.currentPath.length > 1 && !agent.failed) {
        ctx.strokeStyle = typeData.color + (isSelected ? 'AA' : '50');
        ctx.lineWidth = isSelected ? 3 : (typeData.needsRoad ? 2 : 1.5);
        ctx.setLineDash(typeData.needsRoad ? [] : [4, 4]);
        ctx.beginPath();
        const startPath = agent.currentPath.slice(agent.pathIndex);
        if (startPath.length > 0) {
          ctx.moveTo(startPath[0].x * CONFIG.CELL_SIZE + 5, startPath[0].y * CONFIG.CELL_SIZE + 5);
          startPath.slice(1, 25).forEach(p => {
            ctx.lineTo(p.x * CONFIG.CELL_SIZE + 5, p.y * CONFIG.CELL_SIZE + 5);
          });
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Draw agent
      ctx.fillStyle = agent.failed ? '#64748b' : typeData.color;
      ctx.beginPath();
      ctx.arc(agent.pos.x * CONFIG.CELL_SIZE + 5, agent.pos.y * CONFIG.CELL_SIZE + 5, typeData.size, 0, 2 * Math.PI);
      ctx.fill();
      
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (!agent.failed) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typeData.icon, agent.pos.x * CONFIG.CELL_SIZE + 5, agent.pos.y * CONFIG.CELL_SIZE + 5);
      }

      // Energy bar
      if (!agent.failed) {
        const barWidth = 12;
        const barHeight = 3;
        const barX = agent.pos.x * CONFIG.CELL_SIZE + 5 - barWidth / 2;
        const barY = agent.pos.y * CONFIG.CELL_SIZE - 8;
        
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        const energyColor = agent.energy > 50 ? '#10b981' : agent.energy > 25 ? '#f59e0b' : '#ef4444';
        ctx.fillStyle = energyColor;
        ctx.fillRect(barX, barY, (barWidth * agent.energy) / 100, barHeight);
      }
    });
  };

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setTime(t => t + 1);
      
      // Decay pheromones
      mapRef.current.decayPheromones();
      
      setAgents(prevAgents => {
        prevAgents.forEach(agent => agent.move());
        return [...prevAgents];
      });

      setRequests(prev => {
        const stillActive = [];
        let completed = 0;
        prev.forEach(req => {
          const agent = agents.find(a => a.id === req.assignedTo);
          if (agent && agent.missionQueue.length === 0 && agent.currentPath.length <= 1) {
            completed++;
            setMessages(prevMsg => [...prevMsg, { 
              text: `✅ TASK #${req.id} COMPLETED by Agent ${agent.id}`, 
              time: Date.now() 
            }].slice(-10));
          } else {
            // Send progress updates
            if (agent && agent.status === 'Delivering Package' && Math.random() < 0.05) {
              setMessages(prevMsg => [...prevMsg, { 
                text: `📦 Agent ${agent.id}: Delivering package... ETA: ${agent.currentPath.length - agent.pathIndex} steps`, 
                time: Date.now() 
              }].slice(-10));
            }
            stillActive.push(req);
          }
        });
        if (completed > 0) setCompletedCount(c => c + completed);
        return stillActive;
      });

      draw();
    }, 80);

    return () => clearInterval(interval);
  }, [running, agents, requests, selectedAgent]);

  useEffect(() => {
    draw();
  }, [agents, requests, selectedAgent]);

  const avgEnergy = agents.length > 0 ? (agents.filter(a => !a.failed).reduce((sum, a) => sum + a.energy, 0) / agents.filter(a => !a.failed).length).toFixed(1) : 0;
  const totalTasks = agents.reduce((sum, a) => sum + a.completedTasks, 0);
  const fleetStats = {
    ROBOT: agents.filter(a => a.type === 'ROBOT'),
    TRUCK: agents.filter(a => a.type === 'TRUCK'),
    DRONE: agents.filter(a => a.type === 'DRONE')
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-[1800px] mx-auto flex gap-4">
        {/* Left Panel */}
        <div className="w-80 flex flex-col gap-4">
          {/* Fleet Composition */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Fleet Composition
            </h2>
            <div className="space-y-2">
              {Object.entries(fleetStats).map(([type, typeAgents]) => {
                const active = typeAgents.filter(a => !a.failed).length;
                const total = typeAgents.length;
                return (
                  <div key={type} className="bg-slate-800 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{AGENT_TYPES[type].icon}</span>
                        <span className="text-sm font-semibold">{AGENT_TYPES[type].name}</span>
                      </div>
                      <span className="text-xs text-slate-400">{active}/{total}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full transition-all"
                        style={{ 
                          width: `${(active / total) * 100}%`,
                          backgroundColor: AGENT_TYPES[type].color
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Status Monitor */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              Agent Status
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '400px' }}>
              {agents.map(agent => (
                <div 
                  key={agent.id}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                  className={`bg-slate-800 rounded-lg p-2 cursor-pointer transition ${
                    selectedAgent === agent.id ? 'ring-2 ring-purple-500' : 'hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{agent.typeData.icon}</span>
                      <span className="text-xs font-semibold">Agent {agent.id}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ 
                          backgroundColor: agent.failed ? '#64748b' : agent.status === 'Idle' ? '#94a3b8' : '#10b981'
                        }}
                      />
                      <span className="text-xs text-slate-400">{agent.energy.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 mb-1">{agent.status}</div>
                  {agent.currentPackage && (
                    <div className="text-xs text-amber-400">{agent.currentPackage.icon} {agent.currentPackage.name}</div>
                  )}
                  <div className="text-xs text-slate-500">Tasks: {agent.completedTasks}</div>
                </div>
              ))}
            </div>
          </div>

          {/* System Messages */}
          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400" />
              System Messages
            </h2>
            <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
              {messages.slice(-8).reverse().map((msg, i) => (
                <div key={i} className="text-slate-300 bg-slate-800 rounded p-1.5">
                  {msg.text}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-slate-500 italic">No messages yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Center - Main Canvas */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Activity className="w-8 h-8 text-purple-400" />
              HiveRoute Urban Simulator
              <span className="text-lg text-slate-400 font-normal">v2.0</span>
            </h1>
            <p className="text-slate-400">Multi-Agent Delivery with Pheromone Trails & Real-Time Communication</p>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 flex-1 flex items-center justify-center border border-slate-800">
            <canvas 
              ref={canvasRef} 
              width={CONFIG.GRID_SIZE * CONFIG.CELL_SIZE}
              height={CONFIG.GRID_SIZE * CONFIG.CELL_SIZE}
              className="border-2 border-slate-700 rounded-lg cursor-pointer"
              onClick={(e) => {
                const rect = canvasRef.current.getBoundingClientRect();
                const x = Math.floor((e.clientX - rect.left) / CONFIG.CELL_SIZE);
                const y = Math.floor((e.clientY - rect.top) / CONFIG.CELL_SIZE);
                
                const clickedAgent = agents.find(a => 
                  Math.abs(a.pos.x - x) <= 1 && Math.abs(a.pos.y - y) <= 1
                );
                if (clickedAgent) {
                  setSelectedAgent(selectedAgent === clickedAgent.id ? null : clickedAgent.id);
                }
              }}
            />
          </div>

          <div className="bg-slate-900 rounded-xl p-4 flex gap-3 border border-slate-800">
            <button
              onClick={() => setRunning(!running)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg transition font-semibold"
            >
              {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {running ? 'Pause' : 'Start'}
            </button>
            <button
              onClick={initSimulation}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition font-semibold"
            >
              <RotateCcw className="w-5 h-5" />
              Reset
            </button>
            <button
              onClick={addRequest}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition font-semibold"
            >
              <Plus className="w-5 h-5" />
              Add Request
            </button>
            <div className="flex-1"></div>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg font-mono text-lg">
              <Activity className="w-5 h-5 text-purple-400" />
              Time: {time}s
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 flex flex-col gap-4">
          {/* Statistics */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Statistics
            </h2>
            <div className="space-y-3">
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-sm text-slate-400">Average Energy</div>
                <div className="text-2xl font-bold text-yellow-400">{avgEnergy}%</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Active Tasks</div>
                  <div className="text-xl font-bold text-blue-400">{requests.length}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Completed</div>
                  <div className="text-xl font-bold text-emerald-400">{completedCount}</div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-sm text-slate-400">Total Deliveries</div>
                <div className="text-2xl font-bold text-purple-400">{totalTasks}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-sm text-slate-400">Active Agents</div>
                <div className="text-2xl font-bold text-cyan-400">
                  {agents.filter(a => !a.failed).length}/{agents.length}
                </div>
              </div>
            </div>
          </div>

          {/* Package Types */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              Package Types
            </h2>
            <div className="space-y-2">
              {PACKAGE_TYPES.map((pkg, i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{pkg.icon}</span>
                    <div>
                      <div className="text-sm font-semibold">{pkg.name}</div>
                      <div className="text-xs text-slate-400">{pkg.weight}kg</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    pkg.priority === 'High' ? 'bg-red-900 text-red-300' :
                    pkg.priority === 'Medium' ? 'bg-yellow-900 text-yellow-300' :
                    'bg-green-900 text-green-300'
                  }`}>
                    {pkg.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <h2 className="text-lg font-bold mb-3">Map Legend</h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <span>Robot - Road + Pheromones</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🚚</span>
                <span>Truck - Road, Heavy loads</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🚁</span>
                <span>Drone - Air travel, fast</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-400"></div>
                <span>Pickup location</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-400"></div>
                <span>Dropoff location</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-600 rounded"></div>
                <span>Buildings</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-800 rounded"></div>
                <span>Roads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 opacity-40 rounded"></div>
                <span>Pheromone trails (robots)</span>
              </div>
            </div>
          </div>

          {/* Selected Agent Details */}
          {selectedAgent !== null && (() => {
            const agent = agents.find(a => a.id === selectedAgent);
            return agent ? (
              <div className="bg-slate-900 rounded-xl p-5 border border-purple-600">
                <h2 className="text-lg font-bold mb-3">Agent {agent.id} Details</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Type:</span>
                    <span>{agent.typeData.icon} {agent.typeData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-emerald-400">{agent.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Energy:</span>
                    <span className="text-yellow-400">{agent.energy.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Completed:</span>
                    <span className="text-purple-400">{agent.completedTasks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Queue:</span>
                    <span className="text-blue-400">{agent.missionQueue.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Position:</span>
                    <span>({agent.pos.x}, {agent.pos.y})</span>
                  </div>
                  {agent.currentPackage && (
                    <div className="mt-3 p-2 bg-slate-800 rounded">
                      <div className="text-xs text-slate-400 mb-1">Current Package</div>
                      <div>{agent.currentPackage.icon} {agent.currentPackage.name}</div>
                      <div className="text-xs text-slate-400">{agent.currentPackage.weight}kg • {agent.currentPackage.priority} Priority</div>
                    </div>
                  )}
                  {agent.messages.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-slate-400 mb-1">Recent Activity</div>
                      <div className="space-y-1">
                        {agent.messages.slice(-3).reverse().map((msg, i) => (
                          <div key={i} className="text-xs bg-slate-800 rounded p-1.5">
                            {msg.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
};

export default HiveRouteSimulator;