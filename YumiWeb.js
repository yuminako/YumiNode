const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

class YumiWeb {
    constructor(yumiNode) {
        this.yumiNode = yumiNode;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.start();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(session({
            secret: crypto.randomBytes(32).toString('hex'),
            resave: false,
            saveUninitialized: false
        }));
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
    }

    normalizePrivateKey(key) {
        return key.trim()
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\s+/g, '\n');
    }

    validatePrivateKey(inputKey, storedKey) {
        try {
            const normalizedInput = this.normalizePrivateKey(inputKey);
            const normalizedStored = this.normalizePrivateKey(storedKey);

            if (normalizedInput === normalizedStored) {
                return true;
            }

            const testData = Buffer.from('test');
            const privateKey = crypto.createPrivateKey(inputKey);
            const storedPrivateKey = crypto.createPrivateKey(storedKey);

            const sig1 = crypto.sign('sha256', testData, privateKey);
            const sig2 = crypto.sign('sha256', testData, storedPrivateKey);

            return sig1.equals(sig2);
        } catch (error) {
            console.log(`[${this.yumiNode.name}] Erreur de validation de clé:`, error.message);
            return false;
        }
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.render('login', { 
                nodeName: this.yumiNode.name, 
                error: null,
                keyPath: path.join(this.yumiNode.storagePath, 'private.pem')
            });
        });

        this.app.post('/login', (req, res) => {
            const { privateKey } = req.body;
            try {
                const storedPrivateKey = fs.readFileSync(
                    path.join(this.yumiNode.storagePath, 'private.pem'),
                    'utf8'
                );
                
                if (this.validatePrivateKey(privateKey, storedPrivateKey)) {
                    req.session.authenticated = true;
                    res.redirect('/dashboard');
                } else {
                    res.render('login', {
                        nodeName: this.yumiNode.name,
                        error: 'Clé privée invalide',
                        keyPath: path.join(this.yumiNode.storagePath, 'private.pem')
                    });
                }
            } catch (error) {
                res.render('login', {
                    nodeName: this.yumiNode.name,
                    error: 'Erreur d\'authentification: ' + error.message,
                    keyPath: path.join(this.yumiNode.storagePath, 'private.pem')
                });
            }
        });

        const authMiddleware = (req, res, next) => {
            if (req.session.authenticated) {
                next();
            } else {
                res.redirect('/');
            }
        };

        this.app.get('/dashboard', authMiddleware, (req, res) => {
            const connectedPeers = Array.from(this.yumiNode.clients.keys());
            const messages = this.loadMessages();
            res.render('dashboard', {
                nodeName: this.yumiNode.name,
                peers: connectedPeers,
                messages: messages
            });
        });

        this.app.post('/send', authMiddleware, (req, res) => {
            const { target, message } = req.body;
            const ws = this.yumiNode.clients.get(target);
            
            if (ws) {
                this.yumiNode.sendEncryptedMessage(ws, target, message);
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Destinataire non connecté' });
            }
        });
        this.app.get('/blockchain', authMiddleware, (req, res) => {
            res.json({
                chain: this.yumiNode.blockchain.chain,
                pendingMessages: this.yumiNode.blockchain.pendingMessages
            });
        });
        this.app.get('/trust', authMiddleware, (req, res) => {
            res.json({
                trust: this.yumiNode.trust
            });
        });
        this.app.get('/explore', authMiddleware, (req, res) => {
            const { hash } = req.query;
            let chain = this.yumiNode.blockchain.chain;
        
            if (hash) {
                chain = chain.filter(block => block.hash.includes(hash));
            }
        
            res.render('blockchain', { chain });
        });
    }

    loadMessages() {
        try {
            const messagesPath = path.join(this.yumiNode.storagePath, 'messages.json');
            if (fs.existsSync(messagesPath)) {
                return JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
            }
        } catch (error) {
            console.log(`[${this.yumiNode.name}] Erreur de chargement des messages:`, error.message);
        }
        return [];
    }

    start() {
        const webPort = this.yumiNode.port + 1000;
        this.app.listen(webPort, () => {
            console.log(`[${this.yumiNode.name}] Interface web démarrée sur le port ${webPort}`);
        });
    }
}

module.exports = YumiWeb;


