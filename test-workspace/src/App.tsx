import React, { useState, useEffect } from 'react';
import { fetchUsers, User } from './api/userService';
import { UserList } from './components/UserList';
import { Header } from './components/Header';

function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setError('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <Header title="Mon Application" />
      <main>
        {loading && <p>Chargement...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && <UserList users={users} />}
      </main>
    </div>
  );
}

export default App;
