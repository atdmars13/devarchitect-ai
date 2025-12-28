import React from 'react';
import { User } from '../api/userService';

interface UserListProps {
  users: User[];
}

export const UserList: React.FC<UserListProps> = ({ users }) => {
  if (users.length === 0) {
    return <p>Aucun utilisateur trouvé</p>;
  }

  return (
    <ul className="user-list">
      {users.map((user) => (
        <li key={user.id} className="user-item">
          <span className="user-name">{user.name}</span>
          <span className="user-email">{user.email}</span>
        </li>
      ))}
    </ul>
  );
};
