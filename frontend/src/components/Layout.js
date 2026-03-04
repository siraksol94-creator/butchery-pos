import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import SyncStatus from './SyncStatus';
import { FiGrid, FiShoppingCart, FiPackage, FiFileText, FiDollarSign, FiUsers, FiSettings,
         FiChevronDown, FiLogOut, FiSearch, FiBell, FiMenu, FiDownload, FiUpload, FiList,
         FiBook, FiCreditCard, FiClipboard, FiUser, FiUserPlus, FiSliders, FiGlobe } from 'react-icons/fi';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'am', label: 'Amharic', flag: '🇪🇹' },
  { code: 'ti', label: 'Tigrinya', flag: '🇪🇷' },
  { code: 'fr', label: 'French',  flag: '🇫🇷' },
  { code: 'ar', label: 'Arabic',  flag: '🇸🇦' },
  { code: 'sw', label: 'Swahili', flag: '🇰🇪' },
];

const Layout = () => {
  const { user, logout } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const handleLangSelect = (code) => {
    changeLanguage(code);
    setShowLangMenu(false);
  };

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const langRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setShowLangMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getActiveGroup = (pathname) => {
    if (pathname.startsWith('/pos')) return 'pos';
    if (pathname.startsWith('/stock')) return 'stock';
    if (pathname.startsWith('/accounting')) return 'accounting';
    if (pathname.startsWith('/suppliers-customers')) return 'suppliersCustomers';
    if (pathname.startsWith('/settings')) return 'settings';
    return null;
  };

  const [openGroups, setOpenGroups] = useState(() => {
    const active = getActiveGroup(window.location.pathname);
    return { pos: active === 'pos', stock: active === 'stock', accounting: active === 'accounting', suppliersCustomers: active === 'suppliersCustomers', settings: active === 'settings' };
  });

  const toggleGroup = (group) => {
    setOpenGroups(prev => {
      const isOpen = prev[group];
      const allClosed = Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {});
      return { ...allClosed, [group]: !isOpen };
    });
  };

  const isActive = (path) => location.pathname === path;
  const isGroupActive = (paths) => paths.some(p => location.pathname.startsWith(p));

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const pageTitle = () => {
    const path = location.pathname;
    const titles = {
      '/dashboard': t('dashboard'), '/pos': t('pos'), '/pos/sales-report': t('salesReport'),
      '/pos/sales-inventory': t('salesInventory'), '/pos/cash-report': t('cashReport'),
      '/stock/items': t('itemDetails'), '/stock/grn': t('grn'), '/stock/siv': t('siv'),
      '/stock/inventory': t('inventory'), '/stock/adjustments': t('stockAdjustment'),
      '/stock/categories': 'Categories',
      '/accounting/cash-receipts': t('cashReceipt'), '/accounting/payment-vouchers': t('paymentVoucher'),
      '/accounting/cash-book': t('cashBook'), '/accounting/account-payables': t('accountPayables'),
      '/suppliers-customers/suppliers': t('suppliers'), '/suppliers-customers/customers': t('customers'),
      '/settings/profile': t('profile'), '/settings/users': t('users'),
    };
    return titles[path] || t('dashboard');
  };

  const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` : 'JD';

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">🥩</div>
          {!collapsed && (
            <div className="sidebar-brand">
              <h2>Butchery Pro</h2>
              <p>Management System</p>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard */}
          <div className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>
            <FiGrid className="nav-icon" />
            {!collapsed && <span>{t('dashboard')}</span>}
          </div>

          {/* Sales Group */}
          {collapsed ? (
            <div className={`nav-item ${isGroupActive(['/pos']) ? 'active' : ''}`} onClick={() => navigate('/pos')}>
              <FiShoppingCart className="nav-icon" />
            </div>
          ) : (
            <>
              <div className={`nav-group-header ${isGroupActive(['/pos']) ? 'active' : ''}`} onClick={() => toggleGroup('pos')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FiShoppingCart className="nav-icon" />
                  <span>{t('sales')}</span>
                </div>
                <FiChevronDown className={`chevron ${openGroups.pos ? 'open' : ''}`} />
              </div>
              {openGroups.pos && (
                <div className="nav-children">
                  <div className={`nav-item ${isActive('/pos') ? 'active' : ''}`} onClick={() => navigate('/pos')}>
                    <FiShoppingCart className="nav-icon" /> <span>{t('pos')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/pos/sales-report') ? 'active' : ''}`} onClick={() => navigate('/pos/sales-report')}>
                    <FiFileText className="nav-icon" /> <span>{t('salesReport')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/pos/sales-inventory') ? 'active' : ''}`} onClick={() => navigate('/pos/sales-inventory')}>
                    <FiList className="nav-icon" /> <span>{t('salesInventory')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/pos/cash-report') ? 'active' : ''}`} onClick={() => navigate('/pos/cash-report')}>
                    <FiDollarSign className="nav-icon" /> <span>{t('cashReport')}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Stock Group */}
          {!collapsed && (
            <>
              <div className={`nav-group-header ${isGroupActive(['/stock']) ? 'active' : ''}`} onClick={() => toggleGroup('stock')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FiPackage className="nav-icon" />
                  <span>{t('store')}</span>
                </div>
                <FiChevronDown className={`chevron ${openGroups.stock ? 'open' : ''}`} />
              </div>
              {openGroups.stock && (
                <div className="nav-children">
                  <div className={`nav-item ${isActive('/stock/items') ? 'active' : ''}`} onClick={() => navigate('/stock/items')}>
                    <FiFileText className="nav-icon" /> <span>{t('itemDetails')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/grn') ? 'active' : ''}`} onClick={() => navigate('/stock/grn')}>
                    <FiDownload className="nav-icon" /> <span>{t('grn')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/siv') ? 'active' : ''}`} onClick={() => navigate('/stock/siv')}>
                    <FiUpload className="nav-icon" /> <span>{t('siv')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/inventory') ? 'active' : ''}`} onClick={() => navigate('/stock/inventory')}>
                    <FiList className="nav-icon" /> <span>{t('inventory')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/bin-card') ? 'active' : ''}`} onClick={() => navigate('/stock/bin-card')}>
                    <FiList className="nav-icon" /> <span>{t('binCard')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/adjustments') ? 'active' : ''}`} onClick={() => navigate('/stock/adjustments')}>
                    <FiSliders className="nav-icon" /> <span>{t('stockAdjustment')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/stock/categories') ? 'active' : ''}`} onClick={() => navigate('/stock/categories')}>
                    <FiList className="nav-icon" /> <span>Categories</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Accounting Group */}
          {!collapsed && (
            <>
              <div className={`nav-group-header ${isGroupActive(['/accounting']) ? 'active' : ''}`} onClick={() => toggleGroup('accounting')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FiDollarSign className="nav-icon" />
                  <span>{t('accounting')}</span>
                </div>
                <FiChevronDown className={`chevron ${openGroups.accounting ? 'open' : ''}`} />
              </div>
              {openGroups.accounting && (
                <div className="nav-children">
                  <div className={`nav-item ${isActive('/accounting/cash-receipts') ? 'active' : ''}`} onClick={() => navigate('/accounting/cash-receipts')}>
                    <FiBook className="nav-icon" /> <span>{t('cashReceipt')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/accounting/payment-vouchers') ? 'active' : ''}`} onClick={() => navigate('/accounting/payment-vouchers')}>
                    <FiCreditCard className="nav-icon" /> <span>{t('paymentVoucher')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/accounting/cash-book') ? 'active' : ''}`} onClick={() => navigate('/accounting/cash-book')}>
                    <FiClipboard className="nav-icon" /> <span>{t('cashBook')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/accounting/account-payables') ? 'active' : ''}`} onClick={() => navigate('/accounting/account-payables')}>
                    <FiFileText className="nav-icon" /> <span>{t('accountPayables')}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Suppliers & Customers Group */}
          {!collapsed && (
            <>
              <div className={`nav-group-header ${isGroupActive(['/suppliers-customers']) ? 'active' : ''}`} onClick={() => toggleGroup('suppliersCustomers')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FiUsers className="nav-icon" />
                  <span>{t('suppliersCustomers')}</span>
                </div>
                <FiChevronDown className={`chevron ${openGroups.suppliersCustomers ? 'open' : ''}`} />
              </div>
              {openGroups.suppliersCustomers && (
                <div className="nav-children">
                  <div className={`nav-item ${isActive('/suppliers-customers/suppliers') ? 'active' : ''}`} onClick={() => navigate('/suppliers-customers/suppliers')}>
                    <FiUserPlus className="nav-icon" /> <span>{t('suppliers')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/suppliers-customers/customers') ? 'active' : ''}`} onClick={() => navigate('/suppliers-customers/customers')}>
                    <FiUser className="nav-icon" /> <span>{t('customers')}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Settings Group */}
          {!collapsed && (
            <>
              <div className={`nav-group-header ${isGroupActive(['/settings']) ? 'active' : ''}`} onClick={() => toggleGroup('settings')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FiSettings className="nav-icon" />
                  <span>{t('settings')}</span>
                </div>
                <FiChevronDown className={`chevron ${openGroups.settings ? 'open' : ''}`} />
              </div>
              {openGroups.settings && (
                <div className="nav-children">
                  <div className={`nav-item ${isActive('/settings/profile') ? 'active' : ''}`} onClick={() => navigate('/settings/profile')}>
                    <FiUser className="nav-icon" /> <span>{t('profile')}</span>
                  </div>
                  <div className={`nav-item ${isActive('/settings/users') ? 'active' : ''}`} onClick={() => navigate('/settings/users')}>
                    <FiUsers className="nav-icon" /> <span>{t('users')}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Sidebar Footer */}
        {!collapsed && (
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="user-avatar">{initials}</div>
              <div className="user-details">
                <h4>{user?.firstName} {user?.lastName}</h4>
                <p>{user?.role}</p>
              </div>
            </div>
            <button className="logout-btn" onClick={() => { logout(); navigate('/login'); }}>
              <FiLogOut /> {t('logout')}
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Top Header */}
        <div className="top-header">
          <div className="top-header-left">
            <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} style={{ marginRight: 8, color: '#374151' }}>
              <FiMenu />
            </button>
            <h2>{pageTitle()}</h2>
            <span className="online-badge">{t('online')}</span>
          </div>
          <div className="top-header-right">
            <div className="search-bar">
              <FiSearch style={{ color: '#9ca3af' }} />
              <input type="text" placeholder={t('search')} />
            </div>
            {/* Language Selector */}
            <div ref={langRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowLangMenu(p => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151' }}
              >
                <FiGlobe size={15} style={{ color: '#6b7280' }} />
                <span>{currentLang.flag}</span>
                <span>{currentLang.label}</span>
                <FiChevronDown size={13} style={{ color: '#9ca3af' }} />
              </button>
              {showLangMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999, minWidth: 160, overflow: 'hidden' }}>
                  {LANGUAGES.map(lang => (
                    <div
                      key={lang.code}
                      onClick={() => handleLangSelect(lang.code)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        cursor: 'pointer', fontSize: 13, fontWeight: language === lang.code ? 600 : 400,
                        background: language === lang.code ? '#f0f9ff' : '#fff',
                        color: language === lang.code ? '#2563eb' : '#374151',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = language === lang.code ? '#f0f9ff' : '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = language === lang.code ? '#f0f9ff' : '#fff'}
                    >
                      <span style={{ fontSize: 18 }}>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {language === lang.code && <span style={{ marginLeft: 'auto', color: '#2563eb' }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SyncStatus />

            <button className="notification-btn">
              <FiBell />
              <span className="notification-badge">2</span>
            </button>
            <div className="date-display">
              <div style={{ fontWeight: 500 }}>{dateStr}</div>
              <div>{timeStr}</div>
            </div>
          </div>
        </div>

        {/* Page Content - rendered by child routes */}
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
