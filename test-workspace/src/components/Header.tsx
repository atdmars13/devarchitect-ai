import React from 'react';

interface HeaderProps {
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="header">
      <h1>{title}</h1>
      <nav>
        <a href="/">Accueil</a>
        <a href="/users">Utilisateurs</a>
        <a href="/settings">Paramètres</a>
      </nav>
    </header>
  );
};
