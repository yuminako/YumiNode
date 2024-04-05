from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding
import time
import json
import os
import requests
import hashlib
import threading
import asyncio
import socket
import pickle

app = Flask("yuminako.yuminode")
CORS(app)

initialized = False
node_thread = None
should_stop_node = False

def initialize():
    global initialized
    if not initialized:
        # Ajoutez ici le code que vous souhaitez exécuter avant la première requête
        print("Initialization code executed.")
        initialized = True

class Transaction:
    def __init__(self, sender, recipient, amount, timestamp, signature):
        self.sender = sender
        self.recipient = recipient
        self.amount = amount
        self.timestamp = timestamp
        self.signature = signature

def sign_transaction(private_key, transaction_data):
    signature = private_key.sign(
        transaction_data.encode(),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )
    return signature

def verify_transaction(public_key, transaction):
    verifier = public_key.verifier(
        transaction.signature,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )
    verifier.update(json.dumps(transaction.__dict__).encode())
    return verifier.verify()

class Block:
    def __init__(self, index, previous_hash, timestamp, transactions, hash, nonce, expiration_date):
        self.index = index
        self.previous_hash = previous_hash
        self.timestamp = timestamp
        self.transactions = transactions
        self.hash = hash
        self.nonce = nonce
        self.expiration_date = expiration_date

def calculate_hash(index, previous_hash, timestamp, transactions, nonce):
    value = str(index) + str(previous_hash) + str(timestamp) + str(transactions) + str(nonce)
    return hashlib.sha256(value.encode()).hexdigest()

def create_genesis_block():
    return Block(0, "0", time.time(), [], calculate_hash(0, "0", time.time(), [], 0), 0, 0)

def create_new_block(previous_block, transactions, nonce, expiration_date):
    index = previous_block.index + 1
    timestamp = time.time()
    hash = calculate_hash(index, previous_block.hash, timestamp, transactions, nonce)
    return Block(index, previous_block.hash, timestamp, transactions, hash, nonce, expiration_date)

def validate_blockchain(blockchain):
    for i in range(1, len(blockchain)):
        if blockchain[i].previous_hash != blockchain[i - 1].hash:
            return False
    return True

def validate_block(block, previous_block):
    # Vérification du hash du bloc précédent
    if block.previous_hash != previous_block.hash:
        print("Validation failed: Previous hash mismatch.")
        return False

    # Vérification du hash du bloc en fonction de ses propriétés
    calculated_hash = calculate_hash(block.index, block.previous_hash, block.timestamp, block.transactions, block.nonce)
    if block.hash != calculated_hash:
        print("Validation failed: Hash mismatch.")
        return False

    # Vérification de la date d'expiration du bloc
    if is_block_expired(block):
        print("Validation failed: Block expired.")
        return False

    # Votre logique de validation supplémentaire peut être ajoutée ici selon vos besoins

    # Si toutes les vérifications passent, le bloc est considéré comme valide
    return True

def is_block_expired(block):
    return time.time() > block.expiration_date

# Exemple de création de clés publiques et privées pour la démonstration
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048
)
public_key = private_key.public_key()

# Créer la blockchain
blockchain = [create_genesis_block()]
previous_block = blockchain[0]

# Liste des pairs du réseau
peers = set()

# Registre P2P pour la découverte dynamique des pairs
peer_registry = set()

# Enregistrement d'un nouveau pair
def register_node(peer_address):
    peer_registry.add(peer_address)
    for peer in peers:
        requests.post(f'http://{peer}/update_peers', json={'peers': list(peer_registry)})

# Désenregistrement d'un pair
def unregister_node(peer_address):
    peer_registry.discard(peer_address)
    for peer in peers:
        requests.post(f'http://{peer}/update_peers', json={'peers': list(peer_registry)})

# Fonction pour démarrer le nœud dans un thread séparé
def start_node_logic():
    global initialized
    global should_stop_node

    try:
        initialize()
        print("Node started.")

        # ... (Le reste de la logique reste inchangé)

        # Ajouter une condition pour permettre l'arrêt du thread
        while not should_stop_node:
            time.sleep(1)

        print("Node logic stopped.")

    except Exception as e:
        print(f"Error starting node: {e}")
        initialized = False

# Fonction pour démarrer le nœud
def start_node():
    global node_thread
    if node_thread is None or not node_thread.is_alive():
        node_thread = threading.Thread(target=start_node_logic)
        node_thread.start()
        return True
    else:
        print("Node is already running.")
        return False

# Fonction pour arrêter le nœud
def stop_node():
    global should_stop_node, node_thread

    if should_stop_node:
        print("Node is already stopping.")
        return False

    print("Stopping node...")
    should_stop_node = True

    # Attendez que le thread de la logique du nœud se termine
    if node_thread and node_thread.is_alive():
        node_thread.join()
        print("Node stopped successfully.")
        should_stop_node = None
        return True
    else:
        print("Node is not running.")
        return False


# Fonction pour redémarrer le nœud
def restart_node():
    stop_node()
    start_node()

async def listen_for_blocks():
    while True:
        for peer in peers:
            try:
                # Se connecter au pair distant
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.connect((peer.split(":")[0], 5000))

                    # Envoyer une demande pour le dernier bloc
                    s.sendall(b'get_latest_block')

                    # Recevoir le bloc distant
                    data = s.recv(4096)
                    if data:
                        latest_block = pickle.loads(data)

                        # Vérifier le nouveau bloc
                        if validate_block(latest_block, blockchain[-1]) and not is_block_expired(latest_block):
                            blockchain.append(latest_block)
                            print(f"New block received and added to the blockchain: {latest_block.hash}")

            except (socket.error, requests.RequestException) as e:
                print(f"Error connecting to peer {peer}: {e}")

        await asyncio.sleep(5)

@app.route('/public', methods=['GET'])
def list_files():
    public_directory = 'public'
    files = os.listdir(public_directory)
    return jsonify({'files': files})

# Route pour servir les fichiers statiques depuis le dossier 'public'
@app.route('/public/<path:filename>', methods=['GET'])
def serve_static(filename):
    return send_from_directory('public', filename)

# Mise à jour de la liste des pairs
@app.route('/update_peers', methods=['POST'])
def update_peers():
    data = request.get_json()
    peer_registry.update(data.get('peers', []))
    return jsonify({'message': 'Peer list updated successfully'}), 200

# Diffusion d'une transaction à tous les pairs
def broadcast_transaction(transaction):
    for peer in peers:
        requests.post(f'http://{peer}/broadcast_transaction', json={'transaction': transaction.__dict__})

# Diffusion d'un bloc à tous les pairs
def broadcast_block(block):
    for peer in peers:
        requests.post(f'http://{peer}/broadcast_block', json={'block': block.__dict__})

@app.route('/', methods=['GET'])
def home():
    return render_template('index.html')

# Enregistrement d'une transaction
@app.route('/broadcast_transaction', methods=['POST'])
def receive_transaction():
    data = request.get_json()
    transaction_data = data.get('transaction')
    transaction = Transaction(**transaction_data)
    if verify_transaction(public_key, transaction):
        blockchain[-1].transactions.append(transaction)
        broadcast_block(blockchain[-1])
        return jsonify({'message': 'Transaction received and added to the blockchain'}), 200
    else:
        return jsonify({'error': 'Invalid transaction signature'}), 400

# Enregistrement d'un bloc
@app.route('/broadcast_block', methods=['POST'])
def receive_block():
    data = request.get_json()
    block_data = data.get('block')
    block = Block(**block_data)
    if validate_block(block, blockchain[-1]) and not is_block_expired(block):
        blockchain.append(block)
        return jsonify({'message': 'Block received and added to the blockchain'}), 200
    else:
        return jsonify({'error': 'Invalid block or expired'}), 400

# Route pour récupérer tous les pairs connectés
@app.route('/get_peers', methods=['GET'])
def get_peers():
    return jsonify({'peers': list(peers)}), 200

# Enregistrement du nœud dans le registre lorsqu'il démarre
@app.before_request
def before_request():
    initialize()

# Désenregistrement du nœud lorsqu'il s'arrête
@app.route('/unregister', methods=['POST'])
def unregister_self():
    my_address = f'{request.host.split(":")[0]}:5000'
    unregister_node(my_address)
    return jsonify({'message': 'Node unregistered successfully'}), 200

# Route pour obtenir / gérer le statut du nœud (on / off) et afficher son nom et son adresse s'il est "on"
@app.route('/start_node', methods=['GET'])
def start_node_route():
    start_node()
    return jsonify({'message': 'Node started successfully'}), 200

@app.route('/stop_node', methods=['GET'])
def stop_node_route():
    stop_node()
    return jsonify({'message': 'Node stopped successfully'}), 200

@app.route('/restart_node', methods=['GET'])
def restart_node_route():
    restart_node()
    return jsonify({'message': 'Node restarted successfully'}), 200

@app.route('/node_status', methods=['GET'])
def node_status():
    global should_stop_node, node_thread

    if should_stop_node:
        return jsonify({'status': 'offer'}), 200

    if node_thread and node_thread.is_alive():
        return jsonify({
            'status': 'on',
            'node_name': ' ~/YumiNode/okrzgnizhuggffgh/ ',  # Remplacez par le nom de votre nœud
            'node_address': f'{request.host.split(":")[0]}:5000'
        }), 200
    else:
        return jsonify({'status': 'off'}), 200

if __name__ == '__main__':
    # Démarrez le nœud Flask dans un thread séparé
    node_thread = threading.Thread(target=start_node_logic)
    node_thread.start()
    # Démarrer le serveur web Flask dans le thread principal
    app.run(host='0.0.0.0', port=5000)
