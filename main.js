const Node = require('./assets/node');

// Exemple d'utilisation
const node1 = new Node("127.0.0.1", 5001, "127.0.0.1", 6847);
const node2 = new Node("127.0.0.1", 5002, "127.0.0.1", 6847);
const node3 = new Node("127.0.0.1", 5003, "127.0.0.1", 6847);
const node4 = new Node("127.0.0.1", 5004, "127.0.0.1", 6847);
const node5 = new Node("127.0.0.1", 5005, "127.0.0.1", 6847);
const node6 = new Node("127.0.0.1", 5006, "127.0.0.1", 6847);
const node7 = new Node("127.0.0.1", 5007, "127.0.0.1", 6847);
const node8 = new Node("127.0.0.1", 5008, "127.0.0.1", 6847);

// Ajouter des nodes au carnet d'adresses
node1.addToAddressBook("node2", "127.0.0.1", 5002);
node1.addToAddressBook("node3", "127.0.0.1", 5002);
node2.addToAddressBook("node1", "127.0.0.1", 5001);

// Démarrer les serveurs des nodes
node1.startServer();
node2.startServer();
node3.startServer();
node4.startServer();
node5.startServer();
node6.startServer();
node7.startServer();
node8.startServer();