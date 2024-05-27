//Node server for the phaser multiplayer game
// Author: Swapnil Srivasatava

//importing the required modules
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = require('socket.io')(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

app.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
}));

const PORT = 3000;

let activeLobbies = []; // lobbyID : players[]
let players = {};
let player_chosen_charcters = [] //playerID: Charcter

let game_timer = []; // lobbyId: timer_value based on setInterval

let activated_events = [] // All the events that have already been activated in this session.

let dispatched_resources = [] // list of objects { characterName: [List of rosources dispatched], ... }

// Dictionary of resources for each character
const characterResources = {
    "fire": {resources: [
        {
          name: "Fire Truck",
          desc: "A vehicle equipped for firefighting operations, carrying water, fire hoses, and other equipment.",
          location: "Fire Station",
          quantity: 3,
          deployed: 0,
          speed: 40 // mph
        },
        {
          name: "Fire Hose",
          desc: "A high-pressure hose that carries water or other fire retardants to extinguish a fire.",
          location: "Fire Truck",
          quantity: 4,
          deployed: 0,
          speed: 0
        },
        {
          name: "Fire Extinguisher",
          desc: "A portable device used to put out small fires by discharging a substance that cools the burning material, deprives the flame of oxygen, or interferes with the chemical reactions occurring in the flame.",
          location: "Fire Truck",
          quantity: 6,
          deployed: 0,
          speed: 0
        }
      ]
    },
    "police":{resources: [
      {
        name: "Police Officer",
        desc: "People",
        location: "",
        quantity: 10,
        deployed: 0,
        speed: 5,
        image: "sprites/triangle.jpg"
      },
        {
          name: "Police Car",
          desc: "A vehicle used by police officers for patrolling and responding to incidents. It's equipped with sirens and emergency lights.",
          location: "Police Station",
          quantity: 8,
          deployed: 0,
          image: "sprites/triangle.jpg",
          speed: 50 // mph
        },
        {
          name: "S.W.A.T Van",
          desc: "",
          location: "Police Station",
          quantity: 4,
          deployed: 0,
          speed: 40,
          image: "sprites/triangle.jpg"
        }
      ]
    },
    "hazmat": {resources: [
      {
        name: "Hazmat Agent",
        desc: "People",
        location: "",
        quantity: 10,
        deployed: 0,
        speed: 5
      },
        {
          name: "Hazmat Suit",
          desc: "A piece of personal protective equipment that provides full body protection against hazardous materials.",
          location: "Emergency Vehicle",
          quantity: 10,
          deployed: 0,
          speed: 0
        },
        {
          name: "Decontamination Kit",
          desc: "A set of tools and substances used for cleansing hazardous material from equipment, vehicles, and personnel.",
          location: "Emergency Vehicle",
          quantity: 4,
          deployed: 0,
          speed: 0
        },
        {
          name: "Geiger Counter",
          desc: "An instrument used for detecting and measuring ionizing radiation.",
          location: "Emergency Vehicle",
          quantity: 11,
          deployed: 0,
          speed: 0
        }
      ]},
    "medical":{resources: [
        {
          name: "Ambulance",
          desc: "A vehicle specially equipped for taking sick or injured people to and from the hospital, especially in emergencies.",
          location: "Hospital",
          quantity: 4,
          speed: 45 // mph
        },
        {
          name: "Medical Kit",
          desc: "A collection of supplies and equipment for use in giving first aid.",
          location: "Ambulance",
          quantity: 15
        },
        {
          name: "Defibrillator",
          desc: "A device that gives a high energy electric shock to the heart of someone who is in cardiac arrest.",
          location: "Ambulance",
          quantity: 5
        }
      ]
    }
  };

// List of events that can happen in the game
const events = [
    {
        name: "Building on Fire",
        location: "School",
        resources: ["Fire Truck (2)", "Firefighter (2)", "Police Car (2)", "Police Officer (2)"],
        description: "A fire has broken out in a local school. Evacuation and firefighting efforts are needed immediately."
    },
    {
        name: "Major Car Accident",
        location: "Highway",
        resources: ["Ambulance (2)", "Police Car (2)", "Fire Truck (2)"],
        description: "A multi-vehicle collision on the highway with several injuries. Emergency medical services and traffic control are needed."
    },
    {
        name: "Earthquake",
        location: "City Wide",
        resources: ["Ambulance (2)", "Fire Truck (2)"],
        description: "A significant earthquake has caused widespread damage across the city. Search, rescue, and medical services are needed."
    },
    {
        name: "Flooding",
        location: "Lake Area",
        resources: ["Rescue Boat (2)", "Helicopter (1)", "Ambulance (2)"],
        description: "Heavy rains have caused severe flooding in coastal regions. Evacuation and rescue operations are necessary."
    },
];

// Helper functions
function startGameTimer(){
    let seconds = 0;
    setInterval(() => {
        seconds++;
        io.emit('timerUpdate', seconds);
       
    }, 1000);
}

function stopGameTimer(lobbyID){
    if(game_timer[lobbyID]){
        clearInterval(game_timer[lobbyID]);
        delete game_timer[lobbyID];
    }
}

// Add an event to the active events
function activateEvent(event){
    activated_events.push(event);
}

io.on('connection', (socket) => {
    console.log(`New client connected ${socket.id}`); //Websocket handshake complete
    let joined = true; //If joined game // TODO: change back to false
    
    // When new player joins the game
    players[socket.id] = {
        playerId: socket.id,
        character: null,
        isReady: false
    }

    io.emit('currentPlayers', players); //Send the current players to all the clients
    
    // When player selects a character then maintain ground truth
    socket.on('playerSelected', (data) => {
      console.log(`Player ${socket.id} selected ${data}`);
      players[socket.id].character = data;
      socket.emit('resourcesAssigned', characterResources[data].resources); // Send the resources to the player
      // Print the players updated
      console.log("Players updated");
      for(let player in players){
        console.log(players[player].character + " | Ready: " + players[player].isReady);
      }
    });

    socket.on('playerReady', () => {
        players[socket.id].isReady = true;
        console.log(`${socket.id} is ready`);

        // Check if all players are ready
        if(Object.values(players).every(player => player.isReady)){
            console.log("All players are ready!");
            console.log("Starting Game...");
            io.emit('startGame');
            setTimeout(()=>{
                startGameTimer();
            }, 500);
        }
    });
    
    // Player sends a message. Updates state of message board
    socket.on('chatMessage', ({message})=>{
      console.log(`Received message ${message} from ${socket.id}`);
      const sender = players[socket.id];
      io.emit('receiveMessage',{sender, message}); //Relay message to all players
    });
    

    // //Dispatch a resource
    // socket.on('dispatchResource', ({lobbyID, name, amount, eventId})=>{
    //     const sender = player_chosen_charcters[socket.id];
    //     console.log(`Dispatching ${amount} ${name} to event ${eventId}`);
    //     io.to(lobbyID).emit('resourceDispatched', {name, amount, eventId, sender}); //Relay message to all players
    // })

    
    //When a player disconnects
    socket.on('disconnect', () => {
      console.log(`Player disconnected ${socket.id}`);
      delete players[socket.id];
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});