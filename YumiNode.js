const WebSocket = require("ws");
const crypto = require("crypto");
const events = require("events");
const fs = require("fs");
const path = require("path");

class Blockchain {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.chain = this.loadChain();
        this.pendingMessages = [];
    }

    loadChain() {
        try {
            const chainPath = path.join(this.storagePath, 'blockchain.json');
            if (fs.existsSync(chainPath)) {
                return JSON.parse(fs.readFileSync(chainPath, 'utf8'));
            }
        } catch (error) {
            console.log('Création d\'une nouvelle blockchain');
        }
        return [];
    }

    saveChain() {
        const chainPath = path.join(this.storagePath, 'blockchain.json');
        fs.writeFileSync(chainPath, JSON.stringify(this.chain, null, 2));
    }

    addMessage(from, to, encryptedMessage, signature) {
        this.pendingMessages.push({
            timestamp: Date.now(),
            from,
            to,
            encryptedMessage,
            signature
        });
    }

    createBlock() {
        const block = {
            index: this.chain.length,
            timestamp: Date.now(),
            messages: [...this.pendingMessages],
            previousHash: this.chain.length > 0 ? this.getLastBlock().hash : "0",
        };
        block.hash = this.calculateHash(block);
        this.chain.push(block);
        this.pendingMessages = [];
        this.saveChain();
        return block;
    }

    calculateHash(block) {
        return crypto
            .createHash("sha256")
            .update(JSON.stringify(block))
            .digest("hex");
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }

            if (currentBlock.hash !== this.calculateHash(currentBlock)) {
                return false;
            }
        }
        return true;
    }
}

class YumiNode extends events.EventEmitter {
    constructor(name, port, connectToPort = null) {
        super();
        this.name = name;
        this.port = port;
        this.server = null;
        this.clients = new Map();
        this.peerPublicKeys = new Map();
        this.storagePath = path.join(process.cwd(), name);
        this.connectToPort = connectToPort;

        this.initializeStorage();
        this.loadOrGenerateKeys();
        
        this.blockchain = new Blockchain(this.storagePath);
        
        this.startServer();
        
        this.addressBook = new Map();
        this.loadAddressBook();
        
        if (this.connectToPort) {
            setTimeout(() => this.connectToPeer(), 500);
        }

        setInterval(() => this.checkBlockchain(), 10000);
    }

    initializeStorage() {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath);
            console.log(`[${this.name}] Création du dossier de stockage`);
        }
    }

    loadOrGenerateKeys() {
        const publicKeyPath = path.join(this.storagePath, 'public.pem');
        const privateKeyPath = path.join(this.storagePath, 'private.pem');

        if (fs.existsSync(publicKeyPath) && fs.existsSync(privateKeyPath)) {
            console.log(`[${this.name}] Chargement des clés existantes`);
            this.keyPair = {
                publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
                privateKey: fs.readFileSync(privateKeyPath, 'utf8')
            };
        } else {
            console.log(`[${this.name}] Génération de nouvelles clés`);
            const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                    cipher: undefined,
                    passphrase: undefined
                }
            });

            this.keyPair = { publicKey, privateKey };
            fs.writeFileSync(publicKeyPath, publicKey);
            fs.writeFileSync(privateKeyPath, privateKey);
        }
    }

    saveMessage(from, to, encryptedMessage, decryptedMessage = null) {
        const messagesPath = path.join(this.storagePath, 'messages.json');
        let messages = [];
        
        try {
            if (fs.existsSync(messagesPath)) {
                messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
            }
        } catch (error) {
            console.log(`[${this.name}] Erreur lors du chargement des messages:`, error.message);
        }

        messages.push({
            timestamp: Date.now(),
            from,
            to,
            encryptedMessage,
            decryptedMessage
        });

        fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
    }

    startServer() {
        this.server = new WebSocket.Server({ port: this.port });
        console.log(`[${this.name}] Démarrage sur le port ${this.port}`);

        this.server.on("connection", (ws) => {
            ws.on("message", (message) => {
                const { type, data } = JSON.parse(message);
                
                switch(type) {
                    case "publicKey":
                        this.handlePublicKey(ws, data);
                        break;
                    case "message":
                        this.handleMessage(ws, data);
                        break;
                    case "blockchain":
                        this.handleBlockchainUpdate(data);
                        break;
                }
            });

            this.sendPublicKey(ws);
        });
    }

    loadAddressBook() {
        const addressBookPath = path.join(this.storagePath, 'address_book.json');
        try {
            if (fs.existsSync(addressBookPath)) {
                const data = JSON.parse(fs.readFileSync(addressBookPath, 'utf8'));
                this.addressBook = new Map(Object.entries(data));
            }
        } catch (error) {
            console.log(`[${this.name}] Erreur de chargement du carnet d'adresses:`, error.message);
        }
    }

    saveAddressBook() {
        const addressBookPath = path.join(this.storagePath, 'address_book.json');
        const data = Object.fromEntries(this.addressBook);
        fs.writeFileSync(addressBookPath, JSON.stringify(data, null, 2));
    }

    handlePublicKey(ws, data) {
        console.log(`[${this.name}] Connexion établie avec ${data.name}`);
        this.peerPublicKeys.set(data.name, data.key);
        this.clients.set(data.name, ws);

        this.addressBook.set(data.name, {
            port: data.port,
            publicKey: data.key
        });
        this.saveAddressBook();
        this.broadcastAddressBook();
        
        // Envoyer notre carnet d'adresses
        ws.send(JSON.stringify({
            type: "addressBook",
            data: Object.fromEntries(this.addressBook)
        }));
        
        if (this.connectToPort) {
            this.sendEncryptedMessage(ws, data.name, `Bonjour de ${this.name}`);
        }
    }

    sendPublicKey(ws) {
        ws.send(JSON.stringify({
            type: "publicKey",
            data: {
                name: this.name,
                key: this.keyPair.publicKey,
                port: this.port
            }
        }));
    }

    handleMessage(ws, data) {
        try {
            const isValidSignature = crypto.verify(
                "sha256",
                Buffer.from(data.encryptedMessage, 'base64'),
                this.peerPublicKeys.get(data.from),
                Buffer.from(data.signature, 'base64')
            );

            if (!isValidSignature) {
                console.log(`[${this.name}] Message rejeté: signature invalide de ${data.from}`);
                return;
            }

            const decryptedMessage = crypto.privateDecrypt(
                {
                    key: this.keyPair.privateKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
                },
                Buffer.from(data.encryptedMessage, "base64")
            ).toString();
            
            console.log(`[${this.name}] Message reçu de ${data.from}`);
            
            this.saveMessage(data.from, this.name, data.encryptedMessage, decryptedMessage);
            
            this.blockchain.addMessage(
                data.from,
                this.name,
                data.encryptedMessage,
                data.signature
            );
        } catch (error) {
            console.log(`[${this.name}] Erreur de traitement du message:`, error.message);
        }
    }

    handleAddressBook(data) {
        const receivedBook = new Map(Object.entries(data));
        let newConnections = false;
    
        for (const [name, info] of receivedBook) {
            if (!this.addressBook.has(name) && name !== this.name) {
                console.log(`[${this.name}] Nouveau node découvert: ${name}`);
                this.addressBook.set(name, info);
                newConnections = true;


    
                if (!this.clients.has(name)) {
                    const ws = new WebSocket(`ws://localhost:${info.port}`);
                    ws.on("open", () => {
                        console.log(`[${this.name}] Connexion au nouveau node ${name}`);
                        this.sendPublicKey(ws);
                        // Envoyer immédiatement le carnet d'adresses
                        ws.send(JSON.stringify({
                            type: "addressBook",
                            data: Object.fromEntries(this.addressBook)
                        }));
                        this.setupClientHandlers(ws);
                    });
                }
            }
        }
    
        if (newConnections) {
            this.saveAddressBook();
            this.broadcastAddressBook();
        }
    }

    broadcastAddressBook() {
        const addressBookData = Object.fromEntries(this.addressBook);
        for (let [name, ws] of this.clients) {
            ws.send(JSON.stringify({
                type: "addressBook",
                data: addressBookData
            }));
        }
    }

    handleBlockchainUpdate(data) {
        const receivedChain = data.chain;
        if (receivedChain.length > this.blockchain.chain.length) {
            console.log(`[${this.name}] Mise à jour de la blockchain reçue`);
            if (this.validateChain(receivedChain)) {
                this.blockchain.chain = receivedChain;
                this.blockchain.saveChain();
                console.log(`[${this.name}] Blockchain mise à jour`);
            }
        }
    }

    validateChain(chain) {
        return chain.every((block, index) => {
            if (index === 0) return true;
            return block.previousHash === chain[index - 1].hash;
        });
    }

    connectToPeer() {
        const client = new WebSocket(`ws://localhost:${this.connectToPort}`);
        
        client.on("open", () => {
            console.log(`[${this.name}] Connexion au port ${this.connectToPort}`);
            this.sendPublicKey(client);
            // Envoyer le carnet d'adresses actuel
            client.send(JSON.stringify({
                type: "addressBook",
                data: Object.fromEntries(this.addressBook)
            }));
        });

        this.setupClientHandlers(client);
    }

    sendEncryptedMessage(ws, targetName, message) {
        if (!this.peerPublicKeys.has(targetName)) {
            console.log(`[${this.name}] En attente de la clé de ${targetName}...`);
            setTimeout(() => this.sendEncryptedMessage(ws, targetName, message), 100);
            return;
        }

        try {
            const encryptedMessage = crypto.publicEncrypt(
                {
                    key: this.peerPublicKeys.get(targetName),
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
                },
                Buffer.from(message)
            );

            const encodedMessage = encryptedMessage.toString("base64");
            
            const signature = crypto.sign(
                "sha256",
                Buffer.from(encodedMessage, 'base64'),
                this.keyPair.privateKey
            );

            console.log(`[${this.name}] Message envoyé à ${targetName}`);
            
            this.saveMessage(this.name, targetName, encodedMessage, message);

            ws.send(JSON.stringify({
                type: "message",
                data: {
                    from: this.name,
                    encryptedMessage: encodedMessage,
                    signature: signature.toString('base64')
                }
            }));

            this.blockchain.addMessage(
                this.name,
                targetName,
                encodedMessage,
                signature.toString('base64')
            );
        } catch (error) {
            console.log(`[${this.name}] Erreur d'envoi:`, error.message);
        }
    }

    checkBlockchain() {
        if (this.blockchain.pendingMessages.length > 0) {
            const newBlock = this.blockchain.createBlock();
            console.log(`[${this.name}] Nouveau bloc créé: #${newBlock.index}`);
            this.broadcastBlockchain();
        }
    }

    broadcastBlockchain() {
        for (let [name, ws] of this.clients) {
            ws.send(JSON.stringify({
                type: "blockchain",
                data: {
                    chain: this.blockchain.chain
                }
            }));
        }
    }

    broadcast(message) {
        for (let [name, ws] of this.clients) {
            this.sendEncryptedMessage(ws, name, message);
        }
    }

    setupClientHandlers(client) {
        client.on("message", (message) => {
            const { type, data } = JSON.parse(message);
            
            switch(type) {
                case "publicKey":
                    this.handlePublicKey(client, data);
                    break;
                case "message":
                    this.handleMessage(client, data);
                    break;
                case "blockchain":
                    this.handleBlockchainUpdate(data);
                    break;
                case "addressBook":
                    this.handleAddressBook(data);
                    break;
            }
        });
    }
}

module.exports = YumiNode;