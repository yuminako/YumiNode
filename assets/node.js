const net = require('net');

class Node {
    constructor(ip, port, gatewayIp, gatewayPort) {
        this.ip = ip;
        this.port = port;
        this.gatewayIp = gatewayIp;
        this.gatewayPort = gatewayPort;
        this.addressBook = {};
        this.server = net.createServer();
        this.connectToGateway();
    }

    addToAddressBook(nodeId, ip, port) {
        this.addressBook[nodeId] = { ip, port };
    }

    connectToGateway() {
        const socket = new net.Socket();
        socket.connect(this.gatewayPort, this.gatewayIp, () => {
            console.log(`Connected to gateway ${this.gatewayIp}:${this.gatewayPort}`);
            socket.write(JSON.stringify({ ip: this.ip, port: this.port }));
            socket.end();
        });

        socket.on('error', (error) => {
            console.error(`Error connecting to gateway ${this.gatewayIp}:${this.gatewayPort}: ${error.message}`);
        });
    }

    sendDataToGateway(data) {
        const socket = new net.Socket();
        socket.connect(this.gatewayPort, this.gatewayIp, () => {
            console.log(`Sending data to gateway ${this.gatewayIp}:${this.gatewayPort}`);
            socket.write(data);
            socket.end();
        });

        socket.on('error', (error) => {
            console.error(`Error connecting to gateway ${this.gatewayIp}:${this.gatewayPort}: ${error.message}`);
        });
    }

    startServer() {
        this.server.listen(this.port, this.ip, () => {
            console.log(`Node server is running on ${this.ip}:${this.port}`);
        });

        this.server.on('connection', (socket) => {
            console.log(`Node ${this.ip}:${this.port} connected to another node.`);
            socket.on('data', (data) => {
                console.log(`Received data from node: ${data}`);
                this.sendDataToGateway(data);
            });
        });
    }
}

module.exports = Node;