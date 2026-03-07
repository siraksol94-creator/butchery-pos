import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);

// Dashboard
export const getDashboard = () => api.get('/dashboard');

// Products
export const getProducts = (params) => api.get('/products', { params });
export const getProduct = (id) => api.get(`/products/${id}`);
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const updateProductBarcode = (id, data) => api.patch(`/products/${id}/barcode`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const deleteAllProducts = () => api.delete('/products/all');
export const importProducts = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const uploadProductImage = (id, file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post(`/products/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const deleteProductImage = (id) => api.delete(`/products/${id}/image`);

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);
export const deleteAllCategories = () => api.delete('/categories/all');
export const importCategories = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/categories/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Orders
export const getOrders = () => api.get('/orders');
export const createOrder = (data) => api.post('/orders', data);
export const getOrder = (id) => api.get(`/orders/${id}`);
export const reverseOrder = (id) => api.put(`/orders/${id}/reverse`);
export const reverseOrderItem = (orderId, itemId) => api.put(`/orders/${orderId}/items/${itemId}/reverse`);

// GRN
export const getGRNs = () => api.get('/grn');
export const getGRNStats = () => api.get('/grn/stats');
export const createGRN = (data) => api.post('/grn', data);
export const getGRN = (id) => api.get(`/grn/${id}`);
export const getGRNProductReport = (params) => api.get('/grn/product-report', { params });
export const updateGRN = (id, data) => api.put(`/grn/${id}`, data);
export const deleteGRN = (id) => api.delete(`/grn/${id}`);

// Inventory (two-location)
export const getInventory = () => api.get('/inventory');
export const getStoreInventory = () => api.get('/inventory/store');
export const getSalesInventory = (params) => api.get('/inventory/sales', { params });
export const saveSalesActualBalance = (data) => api.post('/inventory/sales/actual', data);
export const getInventoryStats = () => api.get('/inventory/stats');
export const getBinCard = (params) => api.get('/inventory/bin-card', { params });

// SIV
export const getSIVs = () => api.get('/siv');
export const getSIVStats = () => api.get('/siv/stats');
export const createSIV = (data) => api.post('/siv', data);
export const getSIV = (id) => api.get(`/siv/${id}`);
export const updateSIV = (id, data) => api.put(`/siv/${id}`, data);

// Cash Receipts
export const getCashReceipts = () => api.get('/cash-receipts');
export const getCashReceiptStats = () => api.get('/cash-receipts/stats');
export const checkSalesCashReceipt = (date) => api.get('/cash-receipts/check-sales', { params: { date } });
export const createCashReceipt = (data) => api.post('/cash-receipts', data);
export const updateCashReceipt = (id, data) => api.put(`/cash-receipts/${id}`, data);

// Payment Vouchers
export const getPaymentVouchers = (params) => api.get('/payment-vouchers', { params });
export const getPaymentVoucherStats = () => api.get('/payment-vouchers/stats');
export const createPaymentVoucher = (data) => api.post('/payment-vouchers', data);
export const updatePaymentVoucher = (id, data) => api.put(`/payment-vouchers/${id}`, data);

// Cash Book
export const getCashBook = () => api.get('/cash-book');
export const getCashBookStats = () => api.get('/cash-book/stats');
export const setOpeningBalance = (amount) => api.post('/cash-book/opening-balance', { amount });

// Account Payables
export const getAccountPayables = () => api.get('/account-payables');
export const getAccountPayableStats = () => api.get('/account-payables/stats');
export const createAccountPayable = (data) => api.post('/account-payables', data);
export const payInvoice = (id, data) => api.put(`/account-payables/${id}/pay`, data);

// Suppliers
export const getSuppliers = () => api.get('/suppliers');
export const getSupplierStats = () => api.get('/suppliers/stats');
export const createSupplier = (data) => api.post('/suppliers', data);
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data);
export const deleteSupplier = (id) => api.delete(`/suppliers/${id}`);

// Customers
export const getCustomers = (params) => api.get('/customers', { params });
export const getCustomerStats = () => api.get('/customers/stats');
export const createCustomer = (data) => api.post('/customers', data);
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);

// Users
export const getUsers = () => api.get('/users');
export const getUserStats = () => api.get('/users/stats');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Settings
export const getSettings = () => api.get('/settings');
export const updateProfile = (data) => api.put('/settings/profile', data);
export const updateBusiness = (data) => api.put('/settings/business', data);

export default api;
