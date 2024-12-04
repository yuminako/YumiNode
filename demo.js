const YumiNode = require('./YumiNode');
const YumiWeb = require('./YumiWeb');

// Création des nœuds
const node1 = new YumiNode("Node1", 8001);
const node2 = new YumiNode("Node2", 8002, 8001);
const node3 = new YumiNode("Node3", 8003, 8001);

// Création des interfaces web
const web1 = new YumiWeb(node1);
const web2 = new YumiWeb(node2);
const web3 = new YumiWeb(node3);