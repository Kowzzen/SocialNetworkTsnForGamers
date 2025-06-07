import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

function Dashboard({ token, onLogout }) {
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [friendUsername, setFriendUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [genreRecs, setGenreRecs] = useState([]);
  const [suggestedFriends, setSuggestedFriends] = useState([]);

  const axiosAuth = axios.create({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const fetchRecommendations = async () => {
    try {
        const genreRes = await axiosAuth.get(`${API_URL}/recommendations/by-genre`);
        if (Array.isArray(genreRes.data)) setGenreRecs(genreRes.data);
        else setGenreRecs([]);

        const friendSugRes = await axiosAuth.get(`${API_URL}/recommendations/friend-suggestions`);
        if (Array.isArray(friendSugRes.data)) setSuggestedFriends(friendSugRes.data);
        else setSuggestedFriends([]);
    } catch (err) {
        console.error("Impossible de charger les recommandations", err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await axiosAuth.get(`${API_URL}/users/me`);
        setUser(userRes.data);

        const gamesRes = await axios.get(`${API_URL}/games`);
        setGames(gamesRes.data);
        
        fetchRecommendations();

      } catch (err) {
        setError('Impossible de charger les données.');
        if (err.response && err.response.status === 403) {
            onLogout(); // Déconnexion si le token est invalide
        }
      }
    };
    fetchData();
  }, [token]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const res = await axiosAuth.post(`${API_URL}/friends/add/${friendUsername}`);
      setMessage(res.data.message);
      setFriendUsername('');
      fetchRecommendations(); // Rafraîchir les recos y compris suggestions d'amis
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'ajout d'ami.");
    }
  };
  
  const handlePlayGame = async (gameId) => {
    setMessage('');
    setError('');
    try {
        const res = await axiosAuth.post(`${API_URL}/activity/plays/${gameId}`, { status: 'playing' });
        setMessage(res.data.message);
        fetchRecommendations(); // Rafraîchir les recos
    } catch (err) {
        setError(err.response?.data?.error || "Erreur lors de l'ajout à l'activité.");
    }
  }

  // Ajouter un ami depuis les suggestions
  const addFriendQuick = async (username) => {
    setMessage('');
    setError('');
    try {
      const res = await axiosAuth.post(`${API_URL}/friends/add/${username}`);
      setMessage(res.data.message);
      fetchRecommendations();
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'ajout d'ami.");
    }
  };

  if (!user) {
    return <div className="container">Chargement...</div>;
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Tableau de bord de {user.username}</h1>
        <button onClick={onLogout}>Déconnexion</button>
      </div>

      {message && <p className="success-message">{message}</p>}
      {error && <p className="error-message">{error}</p>}
      
      <div className="dashboard-content">
        <div className="section">
          <h2>Mon Profil</h2>
          <p>Email: {user.email}</p>
          <p>Membre depuis: {new Date(user.created_at).toLocaleDateString()}</p>
        </div>

        <div className="section">
          <h2>Ajouter un ami</h2>
          <form onSubmit={handleAddFriend}>
            <input 
              type="text"
              placeholder="Nom d'utilisateur de l'ami"
              value={friendUsername}
              onChange={(e) => setFriendUsername(e.target.value)}
              required
            />
            <button type="submit">Ajouter</button>
          </form>
        </div>
      </div>


      <div className="section">
        <h2>Recommandations pour vous</h2>
        
        <h3>Basées sur vos genres préférés</h3>
        {genreRecs.length > 0 ? (
            <ul className="reco-list">
                {genreRecs.map(rec => (
                    <li key={`genre-rec-${rec.gameId}`}>
                        <div><strong>{rec.title}</strong></div>
                        <div><em>Genres en commun : {rec.commonGenres.join(', ')}</em></div>
                    </li>
                ))}
            </ul>
        ) : (
            <p>Jouez à des jeux pour obtenir des recommandations par genre.</p>
        )}

        <h3 style={{marginTop: '2rem'}}>Suggestions d'amis (genres en commun)</h3>
        {suggestedFriends.length > 0 ? (
            <ul className="reco-list">
                {suggestedFriends.map(sug => (
                    <li key={`sug-${sug.userId}`}>
                        <div><strong>{sug.username}</strong> {sug.isFOF && <span className="badge">Ami d'ami</span>}</div>
                        <div><em>Genres en commun : {sug.commonGenres.join(', ')}</em></div>
                        <button onClick={() => addFriendQuick(sug.username)}>Ajouter</button>
                    </li>
                ))}
            </ul>
        ) : (
            <p>Aucune suggestion pour le moment. Jouez à plus de jeux ou ajoutez des amis !</p>
        )}
      </div>

      <div className="section">
        <h2>Catalogue de Jeux</h2>
        <ul className="game-list">
          {games.map(game => (
            <li key={game.id}>
              <div>
                <h3>{game.title}</h3>
                <p>{game.description_short}</p>
                <span>Genres: {game.genre_tags}</span>
              </div>
              <button onClick={() => handlePlayGame(game.id)}>Marquer comme "joué"</button>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}

export default Dashboard; 