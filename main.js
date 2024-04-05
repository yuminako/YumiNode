const express = require('express');
const bodyParser = require('body-parser');
const Node = require('./assets/node');
const Yumicrypt = require('./yumicrypt');

const app = express();
const port = 3000; // Port sur lequel le serveur écoute

const crypteur = new Yumicrypt(); 

function newName() {
    return "@" + (Math.random() * 0xfffff * 1000000).toString(16) + (Math.random() * 0xfffff * 1000000).toString(16);
}

// Exemple d'utilisation
const node1 = new Node(newName(), crypteur.generateKeyPair(), "127.0.0.1", 5001, "127.0.0.1", 6847);
const node2 = new Node(newName(), crypteur.generateKeyPair(), "127.0.0.1", 5002, "127.0.0.1", 6847);



// Ajouter des nodes au carnet d'adresses
node1.addToaddressBookNodes("node2", "127.0.0.1", 5002);
node1.addToaddressBookNodes("node3", "127.0.0.1", 5002);
node2.addToaddressBookNodes("node1", "127.0.0.1", 5001);

// Démarrer les serveurs des nodes
node1.startServer();
node2.startServer();
let startedNodes = [node1, node2];
let connectedNodes = [];

// Verifie que chaque node de startedNodes est en ligne et connecté à une gateway
function checkNodes() {
    connectedNodes = [];
    startedNodes.forEach(node => {
        if (node.isOnline() && node.isConnectedToGateway()) {
            connectedNodes.push(node.nodeId);
        }else{
            console.log(node.nodeId + "[" + node.isOnline() + "][" + node.isConnectedToGateway() + "]");
        }
    });
}

setTimeout(checkNodes, 5000);



// Middleware pour parser le corps des requêtes
app.use(bodyParser.urlencoded({ extended: true }));

// Route pour afficher le formulaire d'envoi de message
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/send_message.html');
});

// Route pour obtenir la liste des nodes lancé et connecté à une gateway
app.get('/nodes', (req, res) => {
    res.send(connectedNodes);
});

// Route pour gérer l'envoi de message à la passerelle
app.post('/send-message', (req, res) => {
    // ip 
    console.log(req.body);
    
    // Envoyer le message à la passerelle
    node1.sendDataToGateway({ ip : ip, port : port, nodeId: nodeId, action: 'message', content: content });

    res.send('Message sent successfully.');
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
