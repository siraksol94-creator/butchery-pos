import React, { useState, useEffect } from 'react';
import { getStoreInventory } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiSearch, FiDownload, FiPackage, FiAlertTriangle, FiTrendingUp, FiGrid } from 'react-icons/fi';

const getCategoryClass = (cat) => {
  const map = { 'Beef': 'category-beef', 'Chicken': 'category-chicken', 'Pork': 'category-pork', 'Lamb': 'category-lamb', 'Processed': 'category-processed' };
  return map[cat] || 'badge-gray';
};

const getStockStatus = (balance, min) => {
  if (balance <= min * 0.5) return { label: 'Low', class: 'stock-low' };
  if (balance <= min * 1.2) return { label: 'Medium', class: 'stock-medium' };
  return { label: 'Good', class: 'stock-good' };
};

const Inventory = () => {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All Items');

  const fetchItems = async () => {
    try {
      const res = await getStoreInventory();
      if (res.data?.length > 0) setItems(res.data);
    } catch (err) { /* keep empty */ }
  };

  useEffect(() => {
    fetchItems();
    window.addEventListener('sync-complete', fetchItems);
    return () => window.removeEventListener('sync-complete', fetchItems);
  }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase());
    if (filter === 'Low Stock') return matchSearch && parseFloat(i.store_balance) <= parseFloat(i.min_stock || 0);
    return matchSearch;
  });

  const totalItems = items.length;
  const lowStockCount = items.filter(i => parseFloat(i.store_balance) <= parseFloat(i.min_stock || 0)).length;
  const totalValue = items.reduce((sum, i) => sum + parseFloat(i.store_balance) * parseFloat(i.selling_price || 0), 0);
  const categories = [...new Set(items.map(i => i.category_name))].length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>{t('inventoryTitle')}</h1>
          <p>Stock levels in the store (GRN in, SIV out)</p>
        </div>
        <button className="btn btn-primary"><FiDownload /> Export Report</button>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiPackage /></div>
          <div><div className="stat-label">{t('total')} Items</div><div className="stat-value">{totalItems}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}><FiAlertTriangle /></div>
          <div><div className="stat-label">Low Stock</div><div className="stat-value">{lowStockCount}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiTrendingUp /></div>
          <div><div className="stat-label">{t('storeBalance')}</div><div className="stat-value">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiGrid /></div>
          <div><div className="stat-label">Categories</div><div className="stat-value">{categories}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div className="search-input-container" style={{ flex: 1, marginBottom: 0 }}>
          <FiSearch style={{ color: '#9ca3af' }} />
          <input type="text" placeholder="Search by product name or code..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
          <option>All Items</option>
          <option>Low Stock</option>
        </select>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th><th>{t('product')}</th><th>Category</th><th>Opening {t('balance')}</th><th>{t('total')} In</th><th>{t('total')} Out</th><th>{t('storeBalance')}</th><th>Min. Stock</th><th>{t('storeBalance')} Value</th><th>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>{t('noData')}</td></tr>
            ) : filtered.map(item => {
              const storeBalance = parseFloat(item.store_balance);
              const openingBalance = parseFloat(item.opening_balance || 0);
              const totalIn = parseFloat(item.total_in || 0);
              const totalOut = parseFloat(item.total_out || 0);
              const stockStatus = getStockStatus(storeBalance, parseFloat(item.min_stock || 0));
              const value = storeBalance * parseFloat(item.selling_price || 0);
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.code}</td>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td><span className={`badge ${getCategoryClass(item.category_name)}`}>{item.category_name}</span></td>
                  <td>{openingBalance.toLocaleString()} {item.unit}</td>
                  <td style={{ color: '#16a34a', fontWeight: 500 }}>{totalIn.toLocaleString()} {item.unit}</td>
                  <td style={{ color: '#dc2626', fontWeight: 500 }}>{totalOut.toLocaleString()} {item.unit}</td>
                  <td>{storeBalance.toLocaleString()} {item.unit}</td>
                  <td>{parseFloat(item.min_stock || 0).toLocaleString()} {item.unit}</td>
                  <td>${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td><span className={stockStatus.class}>{stockStatus.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;
