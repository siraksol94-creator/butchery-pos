// Runs in renderer context before any page scripts — clears auth so login is always required
window.addEventListener('DOMContentLoaded', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
});
