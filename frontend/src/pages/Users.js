import React, { useState, useEffect } from 'react';
import { getUsers, getUserStats } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiUsers, FiUserCheck, FiUserX, FiShield } from 'react-icons/fi';

const defaultStats = { totalUsers: 5, active: 4, inactive: 1, administrators: 1 };
const defaultUsers = [
  { id: 1, name: 'Admin User', email: 'admin@butcherypro.com', role: 'Administrator', permissions: ['Full Access'], status: 'Active', last_login: '2024-01-15 09:30 AM' },
  { id: 2, name: 'David Johnson', email: 'david@butcherypro.com', role: 'Manager', permissions: ['Sales', 'Stock', 'Reports'], status: 'Active', last_login: '2024-01-15 08:15 AM' },
  { id: 3, name: 'Sarah Williams', email: 'sarah@butcherypro.com', role: 'Cashier', permissions: ['POS', 'Sales'], status: 'Active', last_login: '2024-01-14 04:45 PM' },
  { id: 4, name: 'Michael Brown', email: 'michael@butcherypro.com', role: 'Staff', permissions: ['Stock', 'GRN'], status: 'Active', last_login: '2024-01-14 02:30 PM' },
  { id: 5, name: 'Emma Davis', email: 'emma@butcherypro.com', role: 'Cashier', permissions: ['POS'], status: 'Inactive', last_login: '2024-01-10 11:00 AM' },
];

const roleColors = { Administrator: '#dc2626', Manager: '#2563eb', Cashier: '#16a34a', Staff: '#f59e0b' };
const avatarColors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea'];

const Users = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState(defaultStats);
  const [users, setUsers] = useState(defaultUsers);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, usersRes] = await Promise.all([getUserStats(), getUsers()]);
        if (statsRes.data) setStats(statsRes.data);
        if (usersRes.data?.length > 0) setUsers(usersRes.data);
      } catch (err) { /* use defaults */ }
    };
    fetchData();
  }, []);

  const filtered = users.filter(u => {
    const fullName = `${u.first_name} ${u.last_name}`;
    const matchSearch = !search || fullName.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'All' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getInitials = name => (name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>{t('usersTitle')}</h1>
          <p>{t('manageUsers')}</p>
        </div>
        <button className="btn btn-primary"><FiPlus /> {t('addUser')}</button>
      </div>

      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card stat-card-blue">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiUsers /></div>
          <div><div className="stat-label">{t('total')} {t('users')}</div><div className="stat-value">{stats.totalUsers}</div></div>
        </div>
        <div className="stat-card stat-card-green">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiUserCheck /></div>
          <div><div className="stat-label">{t('active')}</div><div className="stat-value">{stats.active}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiUserX /></div>
          <div><div className="stat-label">{t('inactive')}</div><div className="stat-value">{stats.inactive}</div></div>
        </div>
        <div className="stat-card stat-card-red">
          <div className="stat-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}><FiShield /></div>
          <div><div className="stat-label">Administrators</div><div className="stat-value">{stats.administrators}</div></div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-container">
          <FiSearch style={{ color: '#9ca3af' }} />
          <input type="text" placeholder={t('searchUsers')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="filter-dropdown">
          <option value="All">All Roles</option>
          <option value="Administrator">Administrator</option>
          <option value="Manager">Manager</option>
          <option value="Cashier">Cashier</option>
          <option value="Staff">Staff</option>
        </select>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('users')}</th>
              <th>{t('email')}</th>
              <th>{t('role')}</th>
              <th>Permissions</th>
              <th>{t('status')}</th>
              <th>Last Login</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, idx) => (
              <tr key={user.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="table-avatar" style={{ background: avatarColors[idx % avatarColors.length] }}>
                      {getInitials(`${user.first_name} ${user.last_name}`)}
                    </div>
                    <span style={{ fontWeight: 500 }}>{user.first_name} {user.last_name}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className="badge" style={{ background: `${roleColors[user.role]}15`, color: roleColors[user.role] }}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {user.permissions.map(p => (
                      <span key={p} className="permission-badge">{p}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`badge ${user.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                    {user.status === 'Active' ? t('active') : t('inactive')}
                  </span>
                </td>
                <td style={{ color: '#6b7280', fontSize: '13px' }}>{user.last_login}</td>
                <td>
                  <div className="table-actions">
                    <button className="edit-btn"><FiEdit2 /></button>
                    <button className="delete-btn"><FiTrash2 /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Users;
