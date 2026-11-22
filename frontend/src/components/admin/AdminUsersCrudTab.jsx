import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Key,
  Edit2,
  Trash2,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Search,
  Shield,
  X
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Modal,
  DataTable
} from '../ui';
import { formatIndianDate } from '../../utils/indianTime';

export default function AdminUsersCrudTab({
  users = [],
  phoneNumbers = [],
  currentUser,
  token,
  onRefresh,
  flashSuccess,
  flashError
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'USER',
    password: '',
    assigned_phone_id: ''
  });
  const [creatingUser, setCreatingUser] = useState(false);

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'USER',
    status: 'ACTIVE',
    assigned_phone_id: ''
  });
  const [updatingUser, setUpdatingUser] = useState(false);

  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.phone && u.phone.toLowerCase().includes(term))
    );
  });

  // 1. Create User
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.name || !createForm.email || !createForm.password) {
      if (flashError) flashError('Name, email, and password are required.');
      return;
    }
    setCreatingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(createForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create user');
      }
      if (flashSuccess) flashSuccess(data.message || `User '${createForm.name}' created!`);
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', phone: '', role: 'USER', password: '', assigned_phone_id: '' });
      if (onRefresh) onRefresh();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  // 2. Open Edit Modal
  const openEditModal = (u) => {
    setEditUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'USER',
      status: u.status || 'ACTIVE',
      assigned_phone_id: u.assigned_phone_id || ''
    });
  };

  // 2b. Edit Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setUpdatingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update user');
      }
      if (flashSuccess) flashSuccess(data.message || 'User updated successfully.');
      setEditUser(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setUpdatingUser(false);
    }
  };

  // 3. Reset Password Submit
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword || newPassword.length < 8) {
      if (flashError) flashError('Password must be at least 8 characters long.');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${resetModalUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Password reset failed');
      }
      if (flashSuccess) flashSuccess(data.message || 'Password reset successfully.');
      setResetModalUser(null);
      setNewPassword('');
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setResettingPassword(false);
    }
  };

  // 4. Soft Delete Submit
  const handleDeleteSubmit = async () => {
    if (!deleteModalUser) return;
    setDeletingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteModalUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to soft delete user');
      }
      if (flashSuccess) flashSuccess(data.message || 'User moved to Recycle Bin.');
      setDeleteModalUser(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setDeletingUser(false);
    }
  };

  // 5. Quick Assign Phone
  const handleAssignPhone = async (userId, phoneId) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/assign-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ phoneId: phoneId || null })
      });
      const data = await res.json();
      if (data.success) {
        if (flashSuccess) flashSuccess(data.message);
        if (onRefresh) onRefresh();
      } else {
        if (flashError) flashError(data.message);
      }
    } catch (err) {
      if (flashError) flashError(err.message);
    }
  };

  // 6. Quick Toggle Status
  const handleToggleStatus = async (u) => {
    const newStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/admin/users/${u.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        if (flashSuccess) flashSuccess(data.message);
        if (onRefresh) onRefresh();
      } else {
        if (flashError) flashError(data.message);
      }
    } catch (err) {
      if (flashError) flashError(err.message);
    }
  };

  const userColumns = useMemo(() => [
    {
      header: 'User Details',
      accessor: 'name',
      render: (name, u) => {
        const isSelf = u.id === currentUser?.id;
        return (
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {name} {isSelf && <span style={{ color: 'var(--sarvya-blue)', fontSize: '11px' }}>(You)</span>}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {u.email} • {u.phone || 'No Phone'}
            </div>
          </div>
        );
      }
    },
    {
      header: 'Role',
      accessor: 'role',
      render: (role) => (
        <Badge variant={role === 'ADMIN' ? 'primary' : 'secondary'}>
          {role === 'ADMIN' ? 'MASTER ADMIN' : 'STAFF USER'}
        </Badge>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (status) => (
        <Badge variant={status === 'ACTIVE' ? 'success' : 'danger'}>
          {status}
        </Badge>
      )
    },
    {
      header: 'Assigned WABA Sender Line',
      accessor: 'assigned_phone_id',
      render: (assignedPhoneId, u) => (
        <select
          className="sarvya-input"
          style={{ padding: '3px 8px', fontSize: '12px', minWidth: '170px' }}
          value={assignedPhoneId || ''}
          onChange={(e) => handleAssignPhone(u.id, e.target.value)}
        >
          <option value="">Default Workspace Line</option>
          {phoneNumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({p.phone_number})
            </option>
          ))}
        </select>
      )
    },
    {
      header: 'Registered At',
      accessor: 'created_at',
      render: (createdAt) => (
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          {formatIndianDate(createdAt)}
        </span>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      render: (_, u) => {
        const isSelf = u.id === currentUser?.id;
        return (
          <div style={{ display: 'inline-flex', gap: '6px' }}>
            <Button
              variant="secondary"
              size="sm"
              title="Edit User"
              onClick={() => openEditModal(u)}
            >
              <Edit2 size={13} /> Edit
            </Button>

            <Button
              variant="secondary"
              size="sm"
              title="Reset Password"
              onClick={() => {
                setResetModalUser(u);
                setNewPassword('');
              }}
            >
              <Key size={13} /> Password
            </Button>

            {!isSelf && (
              <>
                <Button
                  variant={u.status === 'ACTIVE' ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => handleToggleStatus(u)}
                >
                  {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  title="Move to Recycle Bin"
                  onClick={() => setDeleteModalUser(u)}
                >
                  <Trash2 size={13} />
                </Button>
              </>
            )}
          </div>
        );
      }
    }
  ], [currentUser, phoneNumbers]);

  return (
    <Card>
      <CardHeader
        title="User & Access Governance"
        icon={Users}
        action={
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> Add User Account
          </Button>
        }
      />
      <CardBody>
        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search users by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sarvya-input"
              style={{ paddingLeft: '32px', fontSize: '13px' }}
            />
          </div>

          <select
            className="sarvya-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ fontSize: '12.5px', minWidth: '150px' }}
          >
            <option value="ALL">All Roles ({users.length})</option>
            <option value="ADMIN">Master Admins</option>
            <option value="USER">Staff Users</option>
          </select>
        </div>

        {/* Users Table */}
        <DataTable
          columns={userColumns}
          data={filteredUsers}
          density="compact"
          pageSize={10}
          emptyMessage="No users matching the search criteria."
        />
      </CardBody>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Add New User Account</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rahul@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Mobile Phone (WhatsApp)</label>
                <input
                  type="text"
                  placeholder="e.g. 919820098200"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Access Role</label>
                  <select
                    className="sarvya-select"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  >
                    <option value="USER">Staff User</option>
                    <option value="ADMIN">Master Admin</option>
                  </select>
                </div>

                <div>
                  <label className="sarvya-field-label">Assigned Phone Line</label>
                  <select
                    className="sarvya-select"
                    value={createForm.assigned_phone_id}
                    onChange={(e) => setCreateForm({ ...createForm, assigned_phone_id: e.target.value })}
                  >
                    <option value="">Default Workspace Line</option>
                    {phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {creatingUser ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Edit User Details</h3>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Email Address *</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Mobile Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Role</label>
                  <select
                    className="sarvya-select"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="USER">Staff User</option>
                    <option value="ADMIN">Master Admin</option>
                  </select>
                </div>

                <div>
                  <label className="sarvya-field-label">Status</label>
                  <select
                    className="sarvya-select"
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Assigned Phone Line</label>
                <select
                  className="sarvya-select"
                  value={editForm.assigned_phone_id || ''}
                  onChange={(e) => setEditForm({ ...editForm, assigned_phone_id: e.target.value })}
                >
                  <option value="">Default Workspace Line</option>
                  {phoneNumbers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} ({p.phone_number})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setEditUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingUser}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {updatingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '420px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Reset User Password</h3>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Reset password for <strong>{resetModalUser.name}</strong> ({resetModalUser.email}).
            </p>

            <form onSubmit={handleResetPasswordSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">New Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setResetModalUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {resettingPassword ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SOFT DELETE CONFIRMATION MODAL */}
      {deleteModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#DC2626' }}>
              <Trash2 size={22} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Move User to Recycle Bin?</h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to soft-delete <strong>{deleteModalUser.name}</strong> ({deleteModalUser.email})?
              <br /><br />
              This user will be deactivated immediately and moved to the <strong>Recycle Bin</strong> where they can be restored at any time.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary"
                onClick={() => setDeleteModalUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingUser}
                onClick={handleDeleteSubmit}
                className="sarvya-btn sarvya-btn-danger"
              >
                {deletingUser ? 'Moving...' : 'Move to Recycle Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
