import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../services/api';
import { FiDollarSign, FiShoppingCart, FiTrendingUp, FiUsers, FiAlertTriangle } from 'react-icons/fi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#dc2626', '#f472b6', '#f97316', '#3b82f6', '#6b7280'];

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({
    todaySales: 22450, totalOrders: 156, weeklyRevenue: 117700, totalCustomers: 1245,
    topProducts: [
      { product_name: 'Prime Beef Steak', units_sold: 245, revenue: 7350 },
      { product_name: 'Chicken Breast', units_sold: 420, revenue: 4200 },
      { product_name: 'Ground Beef', units_sold: 380, revenue: 5700 },
      { product_name: 'Pork Chops', units_sold: 195, revenue: 3900 }
    ],
    lowStock: [
      { name: 'Beef Ribs', current_stock: 12, unit: 'kg' },
      { name: 'Chicken Wings', current_stock: 8, unit: 'kg' },
      { name: 'Pork Sausages', current_stock: 15, unit: 'packs' }
    ],
    salesByCategory: [
      { category: 'Beef', total: 35 },
      { category: 'Chicken', total: 28 },
      { category: 'Pork', total: 18 },
      { category: 'Lamb', total: 12 },
      { category: 'Others', total: 7 }
    ],
    salesTrend: [
      { date: 'Mon', total: 12000 },
      { date: 'Tue', total: 14500 },
      { date: 'Wed', total: 11000 },
      { date: 'Thu', total: 15000 },
      { date: 'Fri', total: 18000 },
      { date: 'Sat', total: 20000 },
      { date: 'Sun', total: 21000 }
    ]
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getDashboard();
        if (res.data && res.data.todaySales !== undefined) setData(res.data);
      } catch (err) {
        // Use default data if API not available
      }
    };
    fetchData();
  }, []);

  return (
    <div className="page-content">
      {/* Summary Cards */}
      <div className="stat-cards">
        <div className="stat-card red">
          <div className="stat-icon"><FiDollarSign /></div>
          <div>
            <div className="stat-label">Today's Sales</div>
            <div className="stat-value">${data.todaySales?.toLocaleString()}</div>
          </div>
          <div className="stat-change">↑ 15.3%</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon"><FiShoppingCart /></div>
          <div>
            <div className="stat-label">Total Orders</div>
            <div className="stat-value">{data.totalOrders}</div>
          </div>
          <div className="stat-change">↑ 8.1%</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><FiTrendingUp /></div>
          <div>
            <div className="stat-label">Weekly Revenue</div>
            <div className="stat-value">${data.weeklyRevenue?.toLocaleString()}</div>
          </div>
          <div className="stat-change">↑ 12.5%</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-icon"><FiUsers /></div>
          <div>
            <div className="stat-label">Total Customers</div>
            <div className="stat-value">{data.totalCustomers?.toLocaleString()}</div>
          </div>
          <div className="stat-change">↑ 6.2%</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="dashboard-grid">
        {/* Sales Trend Chart */}
        <div className="chart-card">
          <h3>Sales Trend (This Week)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" fontSize={12} stroke="#9ca3af" />
              <YAxis fontSize={12} stroke="#9ca3af" />
              <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Sales']} />
              <Line type="monotone" dataKey="total" stroke="#dc2626" strokeWidth={2} dot={{ fill: '#dc2626', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Product Pie */}
        <div className="chart-card">
          <h3>Sales by Product</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.salesByCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="total">
                {data.salesByCategory?.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ padding: '0 16px' }}>
            {data.salesByCategory?.map((cat, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i] }}></div>
                  <span>{cat.category}</span>
                </div>
                <span style={{ fontWeight: 500 }}>{cat.total}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="bottom-grid">
        {/* Top Selling Products */}
        <div className="chart-card">
          <h3>Top Selling Products</h3>
          {data.topProducts?.map((product, i) => (
            <div key={i} className="top-product-item">
              <div className="top-product-rank">{i + 1}</div>
              <div className="top-product-info">
                <h4>{product.product_name}</h4>
                <p>{product.units_sold} units sold</p>
              </div>
              <div className="top-product-revenue">${product.revenue?.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Low Stock Alert */}
        <div className="chart-card">
          <h3><FiAlertTriangle style={{ color: '#ca8a04', marginRight: 6 }} /> Low Stock Alert</h3>
          {data.lowStock?.map((item, i) => (
            <div key={i} className="low-stock-item">
              <div>
                <h4>{item.name}</h4>
                <p>Low stock - reorder soon</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="low-stock-qty">{item.current_stock}</div>
                <div className="low-stock-unit">{item.unit}</div>
              </div>
            </div>
          ))}
          <button className="view-all-btn" onClick={() => navigate('/stock/inventory')}>View All Inventory</button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
