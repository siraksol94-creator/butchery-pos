import React, { useState, useEffect, useRef } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, deleteAllCategories, importCategories } from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiTag, FiUpload, FiDownload, FiAlertTriangle } from 'react-icons/fi';

const emptyForm = { name: '', color: '#6b7280' };

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#92400e', '#166534', '#1e40af',
];

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const csvInputRef = useRef(null);

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete ALL categories? Products will be uncategorized. This cannot be undone.')) return;
    try {
      await deleteAllCategories();
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete all categories.');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportMsg('');
    try {
      const res = await importCategories(file);
      setImportMsg(res.data.message);
      await fetchData();
    } catch (err) {
      setImportMsg(err.response?.data?.error || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSample = () => {
    const csv = 'name,color\nBeef,#ef4444\nChicken,#eab308\nPork,#8b5cf6\nLamb,#22c55e\nProcessed,#3b82f6\nBones,#92400e\nOthers,#6b7280\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample_categories.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const fetchData = async () => {
    try {
      const res = await getCategories();
      if (res.data) setCategories(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('sync-complete', fetchData);
    return () => window.removeEventListener('sync-complete', fetchData);
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setForm({ name: cat.name || '', color: cat.color || '#6b7280' });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) return setError('Category name is required.');
    setSaving(true);
    try {
      if (editingId) {
        await updateCategory(editingId, form);
      } else {
        await createCategory(form);
      }
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? Products in this category will be uncategorized.`)) return;
    try {
      await deleteCategory(cat.id);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete category.');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .cat-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 11px 24px;
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          color: #fff;
          border: none;
          border-radius: 50px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 4px 15px rgba(37,99,235,0.35);
          letter-spacing: 0.3px;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .cat-add-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37,99,235,0.45);
        }
        .cat-add-btn:active {
          transform: translateY(0);
          box-shadow: 0 3px 10px rgba(37,99,235,0.3);
        }
        .cat-add-btn .plus-circle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255,255,255,0.25);
          flex-shrink: 0;
        }

        .cat-edit-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: linear-gradient(135deg, #60a5fa, #2563eb);
          color: #fff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(37,99,235,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .cat-edit-btn:hover {
          transform: translateY(-2px) scale(1.08);
          box-shadow: 0 6px 16px rgba(37,99,235,0.45);
        }
        .cat-edit-btn:active { transform: scale(0.95); }

        .cat-del-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: linear-gradient(135deg, #f87171, #dc2626);
          color: #fff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(220,38,38,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .cat-del-btn:hover {
          transform: translateY(-2px) scale(1.08);
          box-shadow: 0 6px 16px rgba(220,38,38,0.45);
        }
        .cat-del-btn:active { transform: scale(0.95); }

        .cat-save-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 3px 12px rgba(37,99,235,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .cat-save-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(37,99,235,0.4);
        }
        .cat-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .cat-row:hover { background: #f8faff; }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Categories</h1>
          <p>Manage product categories</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleDownloadSample} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 50, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <FiDownload size={14} /> Sample CSV
          </button>
          <button onClick={() => csvInputRef.current?.click()} disabled={importing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: importing ? '#d1fae5' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 10px rgba(16,185,129,0.3)' }}>
            <FiUpload size={14} /> {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button onClick={handleDeleteAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 10px rgba(220,38,38,0.3)' }}>
            <FiAlertTriangle size={14} /> Delete All
          </button>
          <button className="cat-add-btn" onClick={openAdd}>
            <span className="plus-circle"><FiPlus size={14} /></span>
            Add Category
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: importMsg.includes('failed') || importMsg.includes('error') ? '#fef2f2' : '#f0fdf4', color: importMsg.includes('failed') || importMsg.includes('error') ? '#dc2626' : '#16a34a', borderRadius: 8, fontSize: 13, fontWeight: 500, border: `1px solid ${importMsg.includes('failed') || importMsg.includes('error') ? '#fecaca' : '#bbf7d0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><FiX size={14} /></button>
        </div>
      )}

      {/* Summary stat */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ flex: '0 0 auto', minWidth: 180 }}>
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', color: '#2563eb' }}>
            <FiTag />
          </div>
          <div className="stat-info">
            <h3>{categories.length}</h3>
            <p>Total Categories</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th style={{ width: 64 }}>Color</th>
              <th>Name</th>
              <th style={{ width: 160, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#9ca3af' }}>
                    <FiTag size={32} style={{ opacity: 0.4 }} />
                    <span style={{ fontSize: 14 }}>No categories yet.</span>
                    <button className="cat-add-btn" onClick={openAdd} style={{ marginTop: 4, fontSize: 13, padding: '8px 18px' }}>
                      <span className="plus-circle"><FiPlus size={12} /></span>
                      Add Category
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              categories.map((cat, i) => (
                <tr key={cat.id} className="cat-row" style={{ transition: 'background 0.15s' }}>
                  <td style={{ color: '#9ca3af', fontWeight: 500 }}>{i + 1}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', width: 32, height: 32, borderRadius: 8,
                      background: cat.color || '#6b7280',
                      boxShadow: `0 2px 8px ${cat.color || '#6b7280'}60`,
                      border: '2px solid rgba(255,255,255,0.8)',
                      verticalAlign: 'middle'
                    }} />
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '5px 14px', borderRadius: 50,
                      background: (cat.color || '#6b7280') + '18',
                      color: cat.color || '#6b7280',
                      fontWeight: 700, fontSize: 13,
                      border: `1.5px solid ${cat.color || '#6b7280'}35`,
                      letterSpacing: 0.2
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: cat.color || '#6b7280',
                        display: 'inline-block', flexShrink: 0
                      }} />
                      {cat.name}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button className="cat-edit-btn" onClick={() => openEdit(cat)} title="Edit category">
                        <FiEdit2 size={15} />
                      </button>
                      <button className="cat-del-btn" onClick={() => handleDelete(cat)} title="Delete category">
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header" style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              borderRadius: '12px 12px 0 0', padding: '18px 24px'
            }}>
              <h3 style={{ color: '#fff', margin: 0, fontWeight: 700, fontSize: 16 }}>
                {editingId ? '✏️  Edit Category' : '🏷️  Add New Category'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none',
                  borderRadius: 8, color: '#fff', cursor: 'pointer',
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, transition: 'background 0.15s'
                }}
              >
                <FiX />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '22px 24px' }}>
              {error && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px',
                  background: '#fef2f2', color: '#dc2626',
                  borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8
                }}>
                  ⚠️ {error}
                </div>
              )}

              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6, display: 'block' }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Beef, Chicken, Pork..."
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 10, display: 'block' }}>
                  Choose Color
                </label>

                {/* Preset swatches */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(p => ({ ...p, color: c }))}
                      title={c}
                      style={{
                        width: 34, height: 34, borderRadius: 8, background: c,
                        border: 'none', cursor: 'pointer',
                        boxShadow: form.color === c
                          ? `0 0 0 3px #fff, 0 0 0 5px ${c}`
                          : `0 2px 6px ${c}50`,
                        transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                        transition: 'all 0.15s'
                      }}
                    />
                  ))}
                </div>

                {/* Custom picker row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: '#f9fafb',
                  borderRadius: 10, border: '1px solid #e5e7eb'
                }}>
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    style={{
                      width: 38, height: 38, border: 'none',
                      borderRadius: 8, cursor: 'pointer', padding: 0,
                      background: 'none'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Custom color</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', fontFamily: 'monospace' }}>{form.color}</div>
                  </div>
                  {/* Live preview badge */}
                  <span style={{
                    padding: '5px 16px', borderRadius: 50, fontSize: 13, fontWeight: 700,
                    background: form.color + '18', color: form.color,
                    border: `1.5px solid ${form.color}35`,
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: form.color, display: 'inline-block' }} />
                    {form.name || 'Preview'}
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn-secondary"
                onClick={() => setShowForm(false)}
                style={{ borderRadius: 10, padding: '9px 20px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button className="cat-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>⏳ Saving...</>
                ) : editingId ? (
                  <><FiEdit2 size={14} /> Update Category</>
                ) : (
                  <><FiPlus size={14} /> Add Category</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
