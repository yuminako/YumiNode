const e = require('express');
const net = require('net');

class connectedGateway {
    constructor(gatewayId, ip, port) {
        this.gatewayId = gatewayId;
        this.ip = ip;
        this.port = port;
        this.confiance = 33.33;
    }

    sendMessagetoGateway(data) {
        console.log(`Send message to gateway ${this.nodeId} with data : ${data}`);
        this.socket.write(data);
    }
}

class connectedNode {
    constructor(nodeId, gateway, publicKey) {
        this.nodeId = nodeId;
        this.gateway = gateway;
        this.confiance = 33.33;
        this.publicKey = publicKey;
    }

    sendMessagetoNode(data, nodeId, publicKey) {
        console.log(`Send message to node ${nodeId} with data : ${data}`);
        // Crypter data avec la clé publique du node destinataire
        const encryptedData = crypteur.encryptData(data, publicKey);
        // envoyer une requete à la gateway associée pour envoyer le message au node destinataire
        this.gateway.sendMessagetoGateway({ nodeId : this.nodeId, action : 'message', destNodeId: nodeId, data : encryptedData });
    }

    receiveData(data) {
        console.log(`Received data from node ${this.nodeId} : ${data}`);
        // Verifier si le message est pour moi
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
        }else{
            console.log(`Send message to node ${data.nodeId} : ${data}`);
            this.sendMessagetoNode(data.data, data.nodeId);
        }
    }

    receiveDataFromGateway(data) {
        console.log(`Received data from gateway ${this.gatewayId} : ${data}`);
        // Verifier si le message est pour moi
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
        }else{
            console.log(`Send message to node ${data.nodeId} : ${data}`);
            this.sendMessagetoNode(data.data, data.nodeId);
        }
    }

}
    

class Node {
    constructor(nodeId, keys, ip, port, gatewayIp, gatewayPort) {
        // public key doit etre enregistrer dans this.publicKey sans -----BEGIN PUBLIC KEY-----, sans -----END PUBLIC KEY----- et sans \n
        let pKey = keys[0];
        pKey = pKey.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/\n/g, '');
        this.publicKey = pKey;
        this.privateKey = keys[1];
        this.nodeId = nodeId + "_" + pKey;
        this.ip = ip;
        this.port = port;
        this.gateways = [{ip: gatewayIp, port: gatewayPort}];
        this.nodes = [];

        // A retirer
        this.gatewayIp = gatewayIp;
        this.gatewayPort = gatewayPort;

        // Servers
        this.server = net.createServer();
        this.connectToGateway();
    }

    addToaddressBookNodes(nodeId, gateway, publicKey) {
        this.nodes.push(new connectedNode(nodeId, gateway, publicKey));
    }

    addToaddressBookGateways(gatewayId, ip, port) {
        this.gateways.push(new connectedGateway(gatewayId, ip, port));
    }


    receiveData(data) {
        console.log(`Received data from node ${this.nodeId} : ${data}`);
        // Verifier si le message est pour moi
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
            // decrypter le message avec la clé privée
            const decryptedData = crypteur.decryptData(data.data, this.privateKey);
            console.log(`Decrypted data : ${decryptedData}`);
        }else{
            console.log(`Send message to node ${data.nodeId} : ${data}`);
            this.sendDataToGateway(data.nodeId, data.data);
        }
    }

    receiveDataFromGateway(data) {
        console.log(`Received data from gateway ${this.gatewayIp}:${this.gatewayPort} : ${data}`);
        // Verifier si le message est pour moi
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
            this.receiveData(data);
        }else{
            console.log(`Send message to node ${data.nodeId} : ${data}`);
            this.sendDataToGateway(data.nodeId, data.data);
        }
    }

    sendDataToGateway(destNodeId, data) {
        // Verifier si this.gateways contient contiens au moins une gateway et verifier si la gateway est connectée
        if (this.gateways.length > 0) {
            for (let i = 0; i < this.gateways.length; i++) {
                this.gateways[i].sendMessagetoGateway({ nodeId : this.nodeId, action : 'message', destNodeId: destNodeId, data : data });
            }
        }else{
            console.error(`No gateway connected to this node ${this.nodeId}`);
        }
    }


    connectToGateway() {
        const socket = new net.Socket();
        this.gatewaySocket = socket; // Sauvegarder la référence du socket de la Gateway
        socket.connect(this.gatewayPort, this.gatewayIp, () => {
            console.log(`Connected to gateway ${this.gatewayIp}:${this.gatewayPort} with ID : ${this.nodeId}`);
            socket.write(JSON.stringify({ ip: this.ip, port: this.port, nodeId : this.nodeId, action : 'identificate'}));
        });

        socket.on('error', (error) => {
            console.log(`[ERROR] GTW_CONN : la Gateway (${this.gatewayIp}:${this.gatewayPort}) was disconnected {{${error}}}`);
            setTimeout(() => {
                this.connectToGateway();
            }, 5000);
        });

        socket.on('data', (data) => {
            if (typeof data.nodeId !== 'object') {
                console.log(`Receiva data from node ${this.gatewayIp}:${this.gatewayPort}: ${data}`);
                this.receiveDataFromNode(data);
            }else if (data.gatewayId == 'object') {
                console.log(`Receiva data from gateway ${this.gatewayIp}:${this.gatewayPort}: ${data}`);
                this.receiveDataFromGateway(data);
            }else{
                console.error(`Data received from unknow object : ${data}`);
            }
        });
    }

    sendDataToGateway(destNodeId, data) {
        this.gatewaySocket.write(JSON.stringify({ nodeId : this.nodeId, action : 'message', destNodeId: destNodeId, data : data }));
    }

    receiveDataFromGateway(data) {
        console.log(`Received data from gateway: ${typeof data}`);
        // Traiter les données reçues de la gateway
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
        }
    }

    receiveDataFromNode(data) {
        console.log(`Received data from node: ${ data}`);
        // Traiter les données reçues de la gateway
        if (data.nodeId == this.nodeId) {
            console.log(`Its Me : ${data} !`);
        }els
    }

    startServer() {
        this.server.listen(this.port, this.ip, () => {
            console.log('Initialisation of the node server...');
            console.log('Générate keys...');
            console.log(`Node ID : ${this.nodeId}`);
            console.log(`Node server is running on ${this.ip}:${this.port}`);
        });

        this.server.on('connection', (socket) => {
            console.log(`Node ${this.ip}:${this.port} connected to another node or gateway with ip : ${socket.remoteAddress}:${socket.remotePort}.`);
            socket.on('data', (data) => {
                console.log(`Received data from node: ${data}`);
                this.sendDataToGateway('destinationNodeId', data); // Changer 'destinationNodeId' par l'identifiant du nœud destinataire
            });
        });
    }

    isOnline() {
        // verifie si le serveur est en ligne
        if (this.server.listening) {
            return true;
        }else{
            return false;
        }
    }

    isConnectedToGateway() {
        // ping la gateway pour verifier si la connexion est active
        if (this.gatewaySocket.writable) {
            return true;
        }else{
            return false;
        }
    }
}

module.exports = Node;
