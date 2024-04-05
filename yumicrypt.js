const crypto = require('crypto');

class Yumicrypt {
    constructor () {
        this.crypto = crypto;
        this.signature = "";
        this.timesamp = new Date();
        this.blackbox = [{init: "welcome", version: "1.4.3"}];
    }

    generateKeyPair() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
              type: 'spki', // Format de clé publique SubjectPublicKeyInfo
              format: 'pem' // Format PEM (Base64 encodé)
            },
            privateKeyEncoding: {
              type: 'pkcs8', // Format de clé privée PKCS#8
              format: 'pem' // Format PEM (Base64 encodé)
            }
        });

        return [publicKey, privateKey]
    }

    yumiEncryptData(data, publicKey) {
        const bufferData = Buffer.from(data);
        return crypto.publicEncrypt(publicKey, bufferData);
    }

    yumiDecryptData(encryptedData, privateKey) {
        return crypto.privateDecrypt(privateKey, encryptedData);
    }

    yumiSignData(data, privateKey) {
        const sign = crypto.createSign('SHA256');
        sign.update(data);
        sign.end();
        return sign.sign(privateKey);
    }

    yumiVerifyData(data, signature, publicKey) {
        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        verify.end();
        return verify.verify(publicKey, signature);
    }

    yumiHashData(data) {
        const hash = crypto.createHash('sha256');
        hash.update(data);
        return hash.digest('hex');
    }

    yumiHashDataWithSalt(data, salt) {
        const hash = crypto.createHash('sha256');
        hash
            .update(data)
            .update(salt);
        return hash.digest('hex');
    }

    yumiHashDataWithSaltAndPepper(data, salt, pepper) {
        const hash = crypto.createHash('sha256');
        hash
            .update(data)
            .update(salt)
            .update(pepper);
        return hash.digest('hex');
    }

    yumiHashDataWithPepper(data, pepper) {
        const hash = crypto.createHash('sha256');
        hash
            .update(data)
            .update(pepper);
        return hash.digest('hex');
    }

    yumiEncryptImage(image, publicKey) {
        const bufferData = Buffer.from(image);
        return crypto.publicEncrypt(publicKey, bufferData);
    }

    yumiDecryptImage(encryptedImage, privateKey) {
        return crypto.privateDecrypt(privateKey, encryptedImage);
    }
}

// Données à crypter
// const originalData = 'Hello, world!';   

// Crypter les données avec la clé publique
// const encryptedData = encryptData(originalData, publicKey);
// console.log('Données cryptées:', encryptedData.toString('base64'));

// Décrypter les données avec la clé privée
// const decryptedData = decryptData(encryptedData, privateKey);
// console.log('Données décryptées:', decryptedData.toString());

module.exports = Yumicrypt;