import React, { useState, useEffect } from 'react';
import { getCustomers, getCustomerStats } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiPlus, FiSearch, FiPhone, FiMail, FiEdit2, FiTrash2 } from 'react-icons/fi';

const defaultStats = { totalCustomers: 6, retail: 1, wholesale: 2, totalRevenue: 61150 };
const defaultCustomers = [
  { id: 1, name: 'John Smith', type: 'Regular', phone: '+1 555-0201', email: 'john.smith@email.com', total_purchases: 12500, loyalty_points: 250, last_purchase: '2024-01-15' },
  { id: 2, name: 'Metro Restaurant', type: 'Wholesale', phone: '+1 555-0202', email: 'orders@metrorest.com', total_purchases: 18000, loyalty_points: 360, last_purchase: '2024-01-14' },
  { id: 3, name: 'Lisa Anderson', type: 'Regular', phone: '+1 555-0203', email: 'lisa.anderson@email.com', total_purchases: 5200, loyalty_points: 104, last_purchase: '2024-01-13' },
  { id: 4, name: 'City Grill House', type: 'Wholesale', phone: '+1 555-0204', email: 'supply@citygrill.com', total_purchases: 15000, loyalty_points: 300, last_purchase: '2024-01-12' },
  { id: 5, name: 'Robert Martinez', type: 'Regular', phone: '+1 555-0205', email: 'robert.m@email.com', total_purchases: 3450, loyalty_points: 69, last_purchase: '2024-01-11' },
  { id: 6, name: 'Fresh Foods Store', type: 'Retail', phone: '+1 555-0206', email: 'buyer@freshfoods.com', total_purchases: 7000, loyalty_points: 140, last_purchase: '2024-01-10' },
];

const typeColors = { Regular: '#16a34a', Wholesale: '#2563eb', Retail: '#9333ea' };
const avatarColors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#ec4899'];

const Customers = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState(defaultStats);
  const [customers, setCustomers] = useState(defaultCustomers);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, customersRes] = await Promise.all([getCustomerStats(), getCustomers()]);
        if (statsRes.data) setStats(statsRes.data);
        if (customersRes.data?.length > 0) setCustomers(customersRes.data);
      } catch (err) { /* use defaults */ }
    };
    fetchData();
  }, []);

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'All' || c.type === typeFilter;
    return matchSearch && matchType;
  });

  const getInitials = name => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>{t('customersTitle')}</h1>
          <p>Manage customer information and loyalty</p>
        </div>
        <button className="btn btn-primary"><FiPlus /> {t('newEntry')} {t('customer')}</button>
      </div>

      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card stat-card-blue">
          <div><div className="stat-label">{t('total')} {t('customers')}</div><div className="stat-value">{stats.totalCustomers}</div></div>
        </div>
        <div className="stat-card stat-card-green">
          <div><div className="stat-label">Retail</div><div className="stat-value">{stats.retail}</div></div>
        </div>
        <div className="stat-card stat-card-purple">
          <div><div className="stat-label">Wholesale</div><div className="stat-value">{stats.wholesale}</div></div>
        </div>
        <div className="stat-card stat-card-red">
          <div><div className="stat-label">{t('total')} Revenue</div><div className="stat-value">${stats.totalRevenue.toLocaleString()}</div></div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input-container">
          <FiSearch style={{ color: '#9ca3af' }} />
          <input type="text" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="filter-dropdown">
          <option value="All">All Types</option>
          <option value="Regular">Regular</option>
          <option value="Wholesale">Wholesale</option>
          <option value="Retail">Retail</option>
        </select>
      </div>

      <div className="entity-grid">
        {filtered.map((customer, idx) => (
          <div key={customer.id} className="entity-card">
            <div className="entity-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="customer-avatar" style={{ background: avatarColors[idx % avatarColors.length] }}>
                  {getInitials(customer.name)}
                </div>
                <div>
                  <h3>{customer.name}</h3>
                  <span className="customer-type-badge" style={{ background: `${typeColors[customer.type]}15`, color: typeColors[customer.type] }}>
                    {customer.type}
                  </span>
                </div>
              </div>
              <div className="entity-card-actions">
                <button className="edit-btn"><FiEdit2 /></button>
                <button className="delete-btn"><FiTrash2 /></button>
              </div>
            </div>
            <div className="entity-contact">
              <div className="entity-contact-item"><FiPhone size={12} /> {customer.phone}</div>
              <div className="entity-contact-item"><FiMail size={12} /> {customer.email}</div>
            </div>
            <div className="entity-stats">
              <div><div className="entity-stat-label">Total Purchases:</div><div className="entity-stat-value">${customer.total_purchases.toLocaleString()}</div></div>
              <div><div className="entity-stat-label">Loyalty Points:</div><div className="entity-stat-value loyalty-points">{customer.loyalty_points} pts</div></div>
              <div><div className="entity-stat-label">Last Purchase:</div><div className="entity-stat-value">{customer.last_purchase}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Customers;
