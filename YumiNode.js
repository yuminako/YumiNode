const WebSocket = require("ws");
const crypto = require("crypto");
const events = require("events");
const fs = require("fs");
const path = require("path");

class Blockchain {
    constructor(storagePath, nodeKeyPair) {
        this.storagePath = storagePath;
        this.nodeKeyPair = nodeKeyPair;
        this.chain = this.loadChain();
        this.pendingMessages = [];
    
        if (this.chain.length === 0) {
            console.log('[Blockchain] Création du Genesis Block');
            this.chain.push(this.createGenesisBlock());
            this.saveChain();
        }
        console.log(`[Blockchain] Initialisation avec ${this.chain.length} blocs`);
    }

    createGenesisBlock() {
        const networkRules = {
            plaintext: {
                version: "1.0",
                rules: [
                    "1. Tous les messages doivent être signés",
                    "2. La validation des signatures est obligatoire",
                    "3. Les scores de confiance commencent à 50",
                    "4. Un score de confiance inférieur à 30 indique un nœud malveillant",
                    "5. Les blocs sont créés toutes les 10 secondes s'il y a des messages en attente",
                    "6. Chaque nœud doit maintenir une copie à jour de la blockchain"
                ]
            }
        };

        // Chiffrement des règles pour stocker une version chiffrée
        const encryptedRules = crypto.publicEncrypt(
            {
                key: this.nodeKeyPair.publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
            },
            Buffer.from(JSON.stringify(networkRules))
        ).toString('base64');

        // Signature des règles
        const signature = crypto.sign(
            "sha256",
            Buffer.from(encryptedRules, 'base64'),
            this.nodeKeyPair.privateKey
        ).toString('base64');

        const genesisBlock = {
            index: 0,
            timestamp: Date.now(),
            messages: [{
                timestamp: Date.now(),
                from: "GENESIS",
                to: "0",
                encryptedMessage: encryptedRules,
                signature: signature,
                plaintext: JSON.stringify(networkRules.plaintext)
            }],
            previousHash: "0"
        };

        genesisBlock.hash = this.calculateHash(genesisBlock);
        console.log('[Blockchain] Création d\'une nouvelle blockchain');
        this.saveChain(genesisBlock);
        return genesisBlock;
    }

    loadChain() {
        try {
            const chainPath = path.join(this.storagePath, 'blockchain.json');
            if (fs.existsSync(chainPath)) {
                const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
                console.log('[Blockchain] Chargement de la blockchain existante');
                return chain;
            }
            console.log('[Blockchain] Aucune blockchain existante trouvée');
        } catch (error) {
            console.log('[Blockchain] Erreur lors du chargement:', error.message);
        }
        return []; // Retourner un tableau vide si rien n'est chargé
    }

    saveChain(chain = this.chain) {
        const chainPath = path.join(this.storagePath, 'blockchain.json');
        fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2));
        console.log(`[Blockchain] Sauvegarde de ${chain.length} blocs`);
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
        if (this.chain.length === 0) {
            return false;
        }
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
        this.storagePath = path.join(process.cwd(), name);
        this.connectToPort = connectToPort;

        this.initializeStorage();
        this.loadOrGenerateKeys();
       
        console.log(`[${this.name}] Initialisation de la blockchain`);
        this.blockchain = new Blockchain(this.storagePath, this.keyPair);

        if (!this.blockchain.chain || this.blockchain.chain.length === 0) {
            console.error(`[${this.name}] La blockchain est vide ou non initialisée.`);
            this.initializeBlockchain();
        } else {
            console.log(`[${this.name}] Blockchain initialisée avec ${this.blockchain.chain.length} blocs`);
        }
        
        this.startServer();


        this.addressBook = new Map();
        this.clients = new Map();
        this.peerPublicKeys = new Map();
        this.trustScores = new Map();
        this.loadAddressBook();

        if (this.connectToPort) {
            setTimeout(() => this.connectToPeer(), 500);
            setInterval(() => this.broadcastAddressBook(), 10000);
        }

        setInterval(() => this.checkBlockchain(), 10000);
        setInterval(() => this.checkMissingConnections(), 30000);
    }
    

    initializeStorage() {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath);
            console.log(`[${this.name}] Création du dossier de stockage`);
        }
    }

    checkMissingConnections() {
        console.log(`[${this.name}] Vérification des connexions manquantes...`);
        
        for (const [nodeName, nodeInfo] of this.addressBook) {
            // Ignorer notre propre node
            if (nodeName === this.name) continue;
            
            // Vérifier si nous ne sommes pas déjà connectés
            if (!this.clients.has(nodeName)) {
                this.connectToNewNode(nodeName, nodeInfo.port);
            }
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



    adjustTrustScore(nodeName, delta) {
        if (this.addressBook.has(nodeName)) {
            const currentScore = this.addressBook.get(nodeName).trustScore;
            const newScore = Math.max(Math.min(currentScore + delta, 100), 0);
            
            // Mise à jour du score seulement s'il a changé
            if (currentScore !== newScore) {
                console.log(`[${this.name}] Ajustement du score de confiance pour ${nodeName}: ${currentScore} -> ${newScore}`);
                this.addressBook.get(nodeName).trustScore = newScore;
                this.saveAddressBook();
                this.broadcastAddressBook();
            }
        }
    }

    isMaliciousNode(nodeName) {
        const trustScore = this.addressBook.get(nodeName)?.trustScore || 100;
        return trustScore < 30; // Seuil configurable
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
            publicKey: data.key,
            trustScore: 50 // Initial trust score 
        });
        this.saveAddressBook();
        this.broadcastAddressBook();
        
        // Envoyer notre carnet d'adresses
        ws.send(JSON.stringify({
            type: "addressBook",
            data: Object.fromEntries(this.addressBook)
        }));
        
        if (this.connectToPort) {
            // this.sendEncryptedMessage(ws, data.name, `Bonjour ${data.name} ! Je suis ${this.name}`);
            console.log(`[${this.name}] Envoi d'un message de bienvenue à ${data.name}`);
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
                this.adjustTrustScore(data.from, -10); // Réduire la confiance si la signature est invalide
                return;
            }else{
                console.log(`[${this.name}] Message accepté: signature valide de ${data.from}`);
                this.adjustTrustScore(data.from, 1); // Augmenter la confiance si la signature est valide
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
        let hasChanges = false;
    
        for (const [name, info] of receivedBook) {
            if (name === this.name) continue;
            
            if (!this.addressBook.has(name)) {
                // Nouveau node découvert
                this.addressBook.set(name, {
                    ...info,
                    trustScore: 50  // Score initial
                });
                hasChanges = true;
            } else {
                // Mise à jour des informations existantes
                const currentNode = this.addressBook.get(name);
                if (currentNode.port !== info.port || currentNode.publicKey !== info.publicKey) {
                    currentNode.port = info.port;
                    currentNode.publicKey = info.publicKey;
                    hasChanges = true;
                }
            }
        }
        
        if (hasChanges) {
            this.saveAddressBook();
            this.broadcastAddressBook();
            // Vérifier immédiatement les connexions manquantes après une mise à jour
            this.checkMissingConnections();
        }
    }

    connectToNewNode(nodeName, nodePort) {
        // Éviter les connexions en boucle ou inutiles
        if (nodePort === this.port || this.clients.has(nodeName)) {
            return;
        }

        console.log(`[${this.name}] Tentative de connexion au node ${nodeName} sur le port ${nodePort}`);
        
        try {
            const client = new WebSocket(`ws://localhost:${nodePort}`);
            
            // Timeout pour la connexion
            const connectionTimeout = setTimeout(() => {
                if (client.readyState !== WebSocket.OPEN) {
                    console.log(`[${this.name}] Timeout de connexion pour ${nodeName}`);
                    this.adjustTrustScore(nodeName, -10);
                    client.terminate();
                }
            }, 5000); // 5 secondes de timeout

            client.on("open", () => {
                clearTimeout(connectionTimeout);
                console.log(`[${this.name}] Connexion établie avec ${nodeName}`);
                this.sendPublicKey(client);
                this.adjustTrustScore(nodeName, 1);
                
                // Envoyer notre carnet d'adresses
                client.send(JSON.stringify({
                    type: "addressBook",
                    data: Object.fromEntries(this.addressBook)
                }));
            });

            client.on("error", (error) => {
                clearTimeout(connectionTimeout);
                console.log(`[${this.name}] Erreur de connexion au node ${nodeName}:`, error.message);
                this.adjustTrustScore(nodeName, -10);
            });

            client.on("close", () => {
                if (this.clients.has(nodeName)) {
                    this.clients.delete(nodeName);
                    console.log(`[${this.name}] Connexion fermée avec ${nodeName}`);
                }
            });

            this.setupClientHandlers(client);
        } catch (error) {
            console.log(`[${this.name}] Erreur lors de la tentative de connexion à ${nodeName}:`, error.message);
            this.adjustTrustScore(nodeName, -10);
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

    initializeBlockchain() {
        if (this.blockchain.chain.length === 0) {
            console.log(`[${this.name}] Aucun bloc local trouvé. Recherche de blockchain auprès des pairs...`);
    
            let blockchainFound = false;
    
            this.clients.forEach((ws) => this.requestBlockchain(ws));
    
            setTimeout(() => {
                if (!blockchainFound) {
                    console.log(`[${this.name}] Aucune blockchain trouvée. Création du Genesis Block.`);
                    const genesisBlock = this.blockchain.createGenesisBlock();
                    this.blockchain.chain.push(genesisBlock);
                    this.blockchain.saveChain();
                    this.broadcastBlockchain();
                }
            }, 5000);
        }
    }
    
    handleBlockchainUpdate(data) {
        const receivedChain = data.chain;
        if (receivedChain.length > this.blockchain.chain.length) {
            console.log(`[${this.name}] Blockchain reçue de longueur ${receivedChain.length}`);
            if (this.blockchain.isChainValid(receivedChain)) {
                this.blockchain.chain = receivedChain;
                this.blockchain.saveChain();
                console.log(`[${this.name}] Blockchain mise à jour`);
                blockchainFound = true; // Indiquer qu'une blockchain a été trouvée
            } else {
                console.log(`[${this.name}] Blockchain reçue invalide`);
            }
        }
    }

    requestBlockchain(ws) {
        ws.send(JSON.stringify({ type: "requestBlockchain" }));
    }
    
    handleBlockchainRequest(ws) {
        console.log(`[${this.name}] Envoi de la blockchain locale à un pair.`);
        ws.send(JSON.stringify({
            type: "blockchain",
            data: { chain: this.blockchain.chain }
        }));
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
                case "requestBlockchain":
                    this.handleBlockchainRequest(client);
                    break;
                case "blockchain":
                    this.handleBlockchainUpdate(data);
                    break;
            }
        });
    }
}

module.exports = YumiNode;