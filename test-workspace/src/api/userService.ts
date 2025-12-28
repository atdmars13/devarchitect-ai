import axios from 'axios';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

const API_URL = process.env.VITE_API_URL || 'https://api.example.com';

export const fetchUsers = async (): Promise<User[]> => {
  const response = await axios.get<User[]>(`${API_URL}/users`);
  return response.data;
};

export const getUserById = async (id: number): Promise<User> => {
  const response = await axios.get<User>(`${API_URL}/users/${id}`);
  return response.data;
};

export const createUser = async (user: Omit<User, 'id'>): Promise<User> => {
  const response = await axios.post<User>(`${API_URL}/users`, user);
  return response.data;
};

export const deleteUser = async (id: number): Promise<void> => {
  await axios.delete(`${API_URL}/users/${id}`);
};
