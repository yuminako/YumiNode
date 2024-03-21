const Node = require('./assets/node');

// Exemple d'utilisation
const node1 = new Node("127.0.0.1", 5001, "127.0.0.1", 3000);
const node2 = new Node("127.0.0.1", 5002, "127.0.0.1", 3000);

// Ajouter des nodes au carnet d'adresses
node1.addToAddressBook("node2", "127.0.0.1", 5002);
node2.addToAddressBook("node1", "127.0.0.1", 5001);

// Démarrer les serveurs des nodes
node1.startServer();
node2.startServer();