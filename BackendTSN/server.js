// server.js
require('dotenv').config(); // Charger les variables d'environnement en premier !

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose(); // Pour SQLite
const neo4j = require('neo4j-driver'); // Pour Neo4j
const bcrypt = require('bcryptjs'); // Ajout de bcryptjs
const jwt = require('jsonwebtoken'); // Ajout de jsonwebtoken

const app = express();
const PORT = process.env.PORT || 3001; // Port pour le backend

// Middlewares
app.use(cors()); // Permet les requêtes depuis ton frontend React
app.use(express.json()); // Pour parser les requêtes JSON

// --- Configuration SQLite ---
// Crée ou ouvre la base de données 'tsn_database.db'
const db = new sqlite3.Database('./tsn_database.db', (err) => {
    if (err) {
        console.error("Erreur en ouvrant la base de données SQLite", err.message);
    } else {
        console.log("Connecté à la base de données SQLite.");
        db.serialize(() => { // Pour s'assurer que les commandes s'exécutent en séquence
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error("Erreur création table users:", err.message);
            });

            db.run(`CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                description_short TEXT,
                genre_tags TEXT
            )`, (err) => {
                if (err) console.error("Erreur création table games:", err.message);
            });

            // Attend que le driver Neo4j soit potentiellement connecté avant de lancer le seed
            setTimeout(() => {
                if (driver) {
                    seedDatabase().catch(err => console.error("Erreur de seeding de haut niveau:", err));
                }
            }, 2000);
        });
    }
});

// --- Configuration Neo4j ---
// Remplace avec tes identifiants et l'URI de ta base Neo4j (AuraDB, Desktop, etc.)
const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USER;
const PASSWORD = process.env.NEO4J_PASSWORD;
let driver;

if (!URI || !USER || !PASSWORD) {
    console.error("Erreur: Les variables d'environnement NEO4J_URI, NEO4J_USER, et NEO4J_PASSWORD doivent être définies.");
    // process.exit(1); // Optionnel: arrêter le serveur si Neo4j n'est pas configuré
} else {
    try {
        driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
        driver.verifyConnectivity()
            .then(() => console.log('Connecté à Neo4j.'))
            .catch(error => {
                console.error('Erreur connexion Neo4j (vérifiez URI, identifiants et accès réseau):', error);
                // Si la base est AuraDB, assurez-vous que votre IP est autorisée si nécessaire
            });
    } catch (error) {
        console.error('Erreur driver Neo4j (vérifiez le format de l\'URI):', error.message);
    }
}

// --- Fonctions de Seeding ---
async function seedDatabase() {
    const userCheckSql = `SELECT COUNT(id) AS count FROM users WHERE id >= 10`;
    const row = await new Promise((resolve, reject) => {
        db.get(userCheckSql, [], (err, row) => err ? reject(err) : resolve(row));
    });

    if (row && row.count >= 10) {
        console.log("La base de données semble déjà peuplée. Seeding ignoré.");
        return;
    }

    console.log("Début du seeding de la base de données (10 utilisateurs, 10 jeux)...");
    const neo4jSession = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });

    try {
        const games = [
            { title: "Cyberpunk 2077", desc: "RPG futuriste open-world.", tags: "RPG,OpenWorld,Sci-Fi" },
            { title: "The Witcher 3", desc: "RPG fantasy épique.", tags: "RPG,OpenWorld,Fantasy" },
            { title: "Stardew Valley", desc: "Simulation de ferme relaxante.", tags: "Simulation,Indie,PixelArt" },
            { title: "Elden Ring", desc: "Un vaste monde fantastique à explorer.", tags: "RPG,OpenWorld,Souls-like" },
            { title: "Hades", desc: "Défiez le dieu des morts dans ce rogue-like.", tags: "Action,Roguelike,Indie" },
            { title: "Red Dead Redemption 2", desc: "L'aube d'une nouvelle ère pour les hors-la-loi.", tags: "Action,OpenWorld,Adventure" },
            { title: "Baldur's Gate 3", desc: "Un RPG nouvelle génération dans l'univers de D&D.", tags: "RPG,CRPG,Fantasy" },
            { title: "Helldivers 2", desc: "Répandez la démocratie gérée dans la galaxie.", tags: "Action,Shooter,Co-op" },
            { title: "Valorant", desc: "Jeu de tir tactique en 5v5.", tags: "Shooter,Tactical,FPS" },
            { title: "League of Legends", desc: "Arène de bataille en ligne multijoueur.", tags: "MOBA,Strategy" }
        ];
        const gameStmt = db.prepare("INSERT OR IGNORE INTO games (id, title, description_short, genre_tags) VALUES (?, ?, ?, ?)");
        for (let i = 0; i < games.length; i++) {
            gameStmt.run(i + 1, games[i].title, games[i].desc, games[i].tags);
        }
        gameStmt.finalize();
        console.log("Seeding: 10 jeux insérés dans SQLite.");

        const users = [];
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash("password123", salt);
        const userStmt = db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)`);
        for (let i = 1; i <= 10; i++) {
            const user = { id: i, username: `joueur${i}`, email: `joueur${i}@tsn.com` };
            users.push(user);
            userStmt.run(user.id, user.username, user.email, password_hash);
            await neo4jSession.run(`MERGE (u:User {userId: $userId, username: $username})`, { userId: user.id, username: user.username });
        }
        userStmt.finalize();
        console.log("Seeding: 10 utilisateurs (mdp: 'password123') insérés.");

        const friendships = [
            { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }, { from: 2, to: 5 },
            { from: 3, to: 6 }, { from: 3, to: 7 }, { from: 6, to: 1 }, { from: 8, to: 9 }, { from: 8, to: 10 },
        ];
        for (const f of friendships) {
            await neo4jSession.run(`MATCH (u1:User {userId: $from}), (u2:User {userId: $to}) MERGE (u1)-[:KNOWS]->(u2)`, f);
        }
        console.log("Seeding: Relations d'amitié créées.");

        const playQuery = `
            MATCH (u:User {userId: $userId})
            MERGE (g:Game {gameId: $gameId}) ON CREATE SET g.title = $title
            MERGE (u)-[r:PLAYS {status: 'terminé', rating: $rating}]->(g)
            SET r.played_at = timestamp()
            WITH g, r
            UNWIND $genres AS genreName
            MERGE (gen:Genre {name: genreName})
            MERGE (g)-[:HAS_GENRE]->(gen)
        `;
        for (const user of users) {
            const playedGames = new Set();
            while (playedGames.size < 3) playedGames.add(Math.floor(Math.random() * 10) + 1);
            for (const gameId of playedGames) {
                const game = games[gameId - 1];
                await neo4jSession.run(playQuery, {
                    userId: user.id,
                    gameId: gameId,
                    title: game.title,
                    rating: Math.floor(Math.random() * 5) + 1,
                    genres: game.tags.split(','),
                });
            }
        }
        console.log("Seeding: Activités de jeu créées.");

    } catch (error) {
        console.error("Erreur durant le seeding:", error);
    } finally {
        await neo4jSession.close();
        console.log("Seeding terminé.");
    }
}

// --- Middleware d'Authentification JWT (à créer) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401); // Pas de token

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error("Erreur vérification JWT:", err.message);
            return res.sendStatus(403); // Token invalide
        }
        req.user = user; // Ajoute les informations de l'utilisateur à la requête
        next();
    });
};

// --- Routes API ---

// === Authentification ===
// POST /api/auth/register (username, email, password)
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email et password sont requis." });
    }

    try {
        // 1. Hacher le mot de passe
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 2. Stocker dans SQLite
        const sql = `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`;
        db.run(sql, [username, email, password_hash], async function(err) {
            if (err) {
                console.error("Erreur inscription SQLite:", err.message);
                // Gérer les erreurs de contrainte unique (username/email déjà pris)
                if (err.message.includes("UNIQUE constraint failed")) {
                    return res.status(409).json({ error: "Username ou email déjà utilisé." });
                }
                return res.status(500).json({ error: "Erreur interne du serveur lors de l'enregistrement." });
            }

            const userId = this.lastID; // ID de l'utilisateur SQLite

            // 3. Créer un nœud :User dans Neo4j
            if (driver) {
                const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
                try {
                    await session.run(
                        'MERGE (u:User {userId: $userId, username: $username})',
                        { userId: userId, username: username }
                    );
                    console.log(`Nœud User créé/mis à jour dans Neo4j pour userId: ${userId}`);
                } catch (neo4jError) {
                    console.error("Erreur création noeud User Neo4j:", neo4jError);
                    // Que faire si Neo4j échoue ? Pour l'instant, on continue mais on log l'erreur.
                    // On pourrait envisager une logique de compensation ou de retry.
                } finally {
                    await session.close();
                }
            } else {
                console.warn("Driver Neo4j non disponible, le noeud utilisateur n'a pas été créé dans Neo4j.");
            }

            // 4. Créer et retourner un JWT
            const jwtPayload = { userId: userId, username: username };
            const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '1h' }); // Token expire en 1 heure

            res.status(201).json({ 
                message: "Utilisateur enregistré avec succès.",
                token: token,
                user: { id: userId, username: username, email: email }
            });
        });
    } catch (error) {
        console.error("Erreur globale /api/auth/register:", error);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

// POST /api/auth/login (email, password)
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email et password sont requis." });
    }

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) {
            console.error("Erreur login (SQLite):", err.message);
            return res.status(500).json({ error: "Erreur interne du serveur." });
        }
        if (!user) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." }); // Non autorisé
        }

        // Vérifier le mot de passe
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Email ou mot de passe incorrect." });
        }

        // Créer et retourner un JWT
        const jwtPayload = { userId: user.id, username: user.username };
        const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({
            message: "Connexion réussie.",
            token: token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    });
});

// === Utilisateurs (protégé par authentification JWT) ===
// GET /api/users/me
app.get('/api/users/me', authenticateToken, (req, res) => {
    // req.user est disponible grâce au middleware authenticateToken
    const sql = `SELECT id, username, email, created_at FROM users WHERE id = ?`;
    db.get(sql, [req.user.userId], (err, row) => {
        if (err) {
            console.error("Erreur /api/users/me (SQLite):", err.message);
            return res.status(500).json({ error: "Erreur interne du serveur." });
        }
        if (!row) {
            return res.status(404).json({ error: "Utilisateur non trouvé." });
        }
        res.json(row);
    });
});

// === Jeux (non protégé pour la lecture) ===
// GET /api/games
app.get('/api/games', (req, res) => {
    const sql = `SELECT id, title, description_short, genre_tags FROM games`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erreur /api/games (SQLite):", err.message);
            return res.status(500).json({ error: "Erreur interne du serveur." });
        }
        res.json(rows);
    });
});

// === Relations Sociales (protégé, basé sur l'ID utilisateur du JWT et Neo4j) ===
// POST /api/friends/add/:targetUsername
app.post('/api/friends/add/:targetUsername', authenticateToken, async (req, res) => {
    if (!driver) return res.status(503).json({ error: 'Service Neo4j non disponible.' });
    
    const currentUserId = req.user.userId; // ID de l'utilisateur connecté
    const currentUserUsername = req.user.username;
    const targetUsername = req.params.targetUsername;

    if (currentUserUsername === targetUsername) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous ajouter vous-même comme ami." });
    }

    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        // Étape 1: Trouver l'userId du targetUsername à partir de SQLite pour être sûr
        const findUserSql = `SELECT id FROM users WHERE username = ?`;
        db.get(findUserSql, [targetUsername], async (err, targetUserRow) => {
            if (err) {
                console.error("Erreur recherche targetUser SQLite:", err.message);
                return res.status(500).json({ error: "Erreur lors de la recherche de l'utilisateur cible." });
            }
            if (!targetUserRow) {
                return res.status(404).json({ error: `L'utilisateur ${targetUsername} n'a pas été trouvé.` });
            }
            
            const targetUserId = targetUserRow.id;

            // Étape 2: Créer la relation dans Neo4j en utilisant les userId
            const result = await session.run(
                `MERGE (u1:User {userId: $currentUserId, username: $currentUserUsername})
                 MERGE (u2:User {userId: $targetUserId, username: $targetUsername})
                 MERGE (u1)-[r:KNOWS]->(u2)
                 RETURN type(r) as relationshipType`,
                { currentUserId: currentUserId, currentUserUsername: currentUserUsername, targetUserId: targetUserId, targetUsername: targetUsername }
            );

            if (result.records.length === 0) {
                return res.status(500).json({ error: `La relation d'amitié n'a pas pu être créée avec ${targetUsername}.` });
            }
            
            res.status(200).json({ message: `Vous êtes maintenant ami avec ${targetUsername}.` });
        });
    } catch (error) {
        console.error("Erreur ajout ami Neo4j:", error);
        // S'assurer que la session est fermée même en cas d'erreur avant db.get
        if (session && typeof session.close === 'function') { // Vérifier si session est définie et a une méthode close
             await session.close(); // Déplacé ici pour être sûr
        }
        res.status(500).json({ error: "Erreur interne lors de l'ajout d'ami." });
    } finally {
        // La session pourrait déjà être fermée si une erreur s'est produite avant db.get
        if (session && typeof session.close === 'function' && session.isOpen()) { // Vérifier si la session est ouverte avant de la fermer
            await session.close();
        }
    }
});

// POST /api/activity/plays/:gameId
app.post('/api/activity/plays/:gameId', authenticateToken, async (req, res) => {
    if (!driver) return res.status(503).json({ error: 'Service Neo4j non disponible.' });

    const userId = req.user.userId; // ID de l'utilisateur SQLite
    const gameId = parseInt(req.params.gameId, 10);
    const { status, rating } = req.body; // Ex: status: "terminé", rating: 5

    if (isNaN(gameId)) {
        return res.status(400).json({ error: "L'ID du jeu doit être un nombre." });
    }

    // Étape 1: Vérifier si le jeu existe dans SQLite et récupérer son titre ET ses genres
    const gameSql = `SELECT title, genre_tags FROM games WHERE id = ?`;
    db.get(gameSql, [gameId], async (err, gameRow) => {
        if (err) {
            console.error("Erreur recherche jeu SQLite:", err.message);
            return res.status(500).json({ error: "Erreur lors de la vérification du jeu." });
        }
        if (!gameRow) {
            return res.status(404).json({ error: `Le jeu avec l'ID ${gameId} n'a pas été trouvé.` });
        }

        const gameTitle = gameRow.title;
        const genres = gameRow.genre_tags ? gameRow.genre_tags.split(',') : [];

        const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
        try {
            // Étape 2: Créer/mettre à jour les nœuds et les relations dans Neo4j, y compris les genres
            await session.run(
                `MATCH (u:User {userId: $userId})
                 MERGE (g:Game {gameId: $gameId})
                 ON CREATE SET g.title = $gameTitle 
                 ON MATCH SET g.title = $gameTitle 
                 MERGE (u)-[r:PLAYS]->(g)
                 SET r.status = $status, r.rating = $rating, r.played_at = timestamp()
                 WITH g, r
                 UNWIND $genres AS genreName
                 MERGE (gen:Genre {name: genreName})
                 MERGE (g)-[:HAS_GENRE]->(gen)
                 RETURN type(r) as relationshipType`,
                { userId: userId, gameId: gameId, gameTitle: gameTitle, status: status, rating: rating || null, genres: genres }
            );
            res.status(200).json({ message: `Activité de jeu enregistrée pour le jeu ${gameTitle} (ID: ${gameId}).` });
        } catch (error) {
            console.error("Erreur enregistrement activité Neo4j:", error);
            res.status(500).json({ error: "Erreur interne lors de l'enregistrement de l'activité." });
        } finally {
            await session.close();
        }
    });
});

// === Recommandations Simples (protégé, basé sur Neo4j) ===
// GET /api/recommendations/friends-activity
app.get('/api/recommendations/friends-activity', authenticateToken, async (req, res) => {
    if (!driver) return res.status(503).json({ error: 'Service Neo4j non disponible.' });
    
    const userId = req.user.userId;
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        const result = await session.run(
           `MATCH (currentUser:User {userId: $userId})-[:KNOWS]->(friend:User)-[p:PLAYS]->(game:Game)
            WHERE NOT (currentUser)-[:PLAYS]->(game)
            WITH game, collect(friend.username) AS friendsWhoPlayed, p.played_at AS lastPlayedTimestamp
            RETURN game.gameId AS gameId, game.title AS gameTitle, friendsWhoPlayed, lastPlayedTimestamp
            ORDER BY lastPlayedTimestamp DESC, size(friendsWhoPlayed) DESC
            LIMIT 10`, // Limiter les résultats
            { userId: userId }
        );
        const recommendations = result.records.map(record => ({
            gameId: record.get('gameId'),
            title: record.get('gameTitle'),
            playedByFriends: record.get('friendsWhoPlayed'),
            lastPlayed: new Date(record.get('lastPlayedTimestamp')).toLocaleString()
        }));
        res.json(recommendations);
    } catch (error) {
        console.error("Erreur recommandation (activité amis) Neo4j:", error);
        res.status(500).json({ error: "Erreur interne lors de la récupération des recommandations." });
    } finally {
        await session.close();
    }
});

// GET /api/recommendations/by-genre
app.get('/api/recommendations/by-genre', authenticateToken, async (req, res) => {
    if (!driver) return res.status(503).json({ error: 'Service Neo4j non disponible.' });

    const userId = req.user.userId;
    // TODO: Il faut d'abord que l'utilisateur puisse enregistrer ses genres préférés (:INTERESTED_IN)
    // Pour l'instant, cette route sera un placeholder plus avancé.
    // On pourrait aussi se baser sur les genres des jeux auxquels l'utilisateur a joué.

    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        // Exemple: Recommander des jeux des genres les plus joués par l'utilisateur
        const result = await session.run(
           `MATCH (currentUser:User {userId: $userId})-[:PLAYS]->(playedGame:Game)-[:HAS_GENRE]->(genre:Genre)
            WITH currentUser, genre, COUNT(playedGame) AS gamesInGenrePlayedByUser
            ORDER BY gamesInGenrePlayedByUser DESC
            LIMIT 5 // Considérer les top N genres joués par l'utilisateur
            MATCH (genre)<-[:HAS_GENRE]-(recommendedGame:Game)
            WHERE NOT (currentUser)-[:PLAYS]->(recommendedGame)
            WITH recommendedGame, COLLECT(DISTINCT genre.name) AS commonGenresWithPlayedGames, COUNT(DISTINCT genre) AS commonGenreCount
            RETURN recommendedGame.gameId AS gameId, recommendedGame.title AS gameTitle, commonGenresWithPlayedGames
            ORDER BY commonGenreCount DESC, size(commonGenresWithPlayedGames) DESC
            LIMIT 10`,
            { userId }
        );
        const recommendations = result.records.map(record => ({
            gameId: record.get('gameId'),
            title: record.get('gameTitle'),
            commonGenres: record.get('commonGenresWithPlayedGames')
        }));

        if (recommendations.length === 0) {
            return res.json({ message: "Pas encore de recommandations par genre. Jouez à plus de jeux ou indiquez vos genres préférés !" });
        }
        res.json(recommendations);
    } catch (error) {
        console.error("Erreur recommandation (par genre) Neo4j:", error);
        res.status(500).json({ error: "Erreur interne lors de la récupération des recommandations." });
    } finally {
        await session.close();
    }
});

// === Recommandations d'amis (protégé) ===
// GET /api/recommendations/friend-suggestions
app.get('/api/recommendations/friend-suggestions', authenticateToken, async (req, res) => {
    if (!driver) return res.status(503).json({ error: 'Service Neo4j non disponible.' });
    const userId = req.user.userId;
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        const query = `
            MATCH (current:User {userId: $userId})
            // Collection des amis d'amis
            OPTIONAL MATCH (current)-[:KNOWS]->(:User)-[:KNOWS]->(fof:User)
            WHERE fof.userId <> $userId AND NOT (current)-[:KNOWS]->(fof)
            WITH current, collect(DISTINCT fof) AS fofCandidates
            // Chercher des utilisateurs partageant des genres
            MATCH (current)-[:PLAYS]->(:Game)-[:HAS_GENRE]->(g:Genre)<-[:HAS_GENRE]-(:Game)<-[:PLAYS]-(cand:User)
            WHERE cand.userId <> $userId AND NOT (current)-[:KNOWS]->(cand)
            WITH cand, fofCandidates, collect(DISTINCT g.name) AS commonGenres
            WITH cand, commonGenres, size(commonGenres) AS score,
                 (cand IN fofCandidates) AS isFOF
            RETURN cand.userId AS userId, cand.username AS username, commonGenres, score, isFOF
            ORDER BY isFOF DESC, score DESC, username
            LIMIT 10`;

        const result = await session.run(query, { userId });
        const suggestions = result.records.map(rec => ({
            userId: rec.get('userId').toInt ? rec.get('userId').toInt() : rec.get('userId'),
            username: rec.get('username'),
            commonGenres: rec.get('commonGenres'),
            score: rec.get('score').toInt ? rec.get('score').toInt() : rec.get('score'),
            isFOF: rec.get('isFOF'),
        }));
        res.json(suggestions);
    } catch (error) {
        console.error("Erreur recommandation amis Neo4j:", error);
        res.status(500).json({ error: "Erreur interne lors de la récupération des suggestions d'amis." });
    } finally {
        await session.close();
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur backend TSN démarré sur http://localhost:${PORT}`);
});

// Fermeture propre des connexions
process.on('SIGINT', () => {
    console.log("\nFermeture du serveur...");
    db.close((err) => {
        if (err) console.error("Erreur fermeture SQLite:", err.message);
        else console.log('Connexion SQLite fermée.');
    });
    if (driver) {
        driver.close()
            .then(() => console.log('Connexion Neo4j fermée.'))
            .catch(err => console.error("Erreur fermeture Neo4j:", err.message));
    }
    setTimeout(() => { process.exit(0); }, 1000); // Laisse un peu de temps pour fermer
});