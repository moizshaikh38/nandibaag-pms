import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/ManualBookingForm.css';

const ManualBookingForm = () => {
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    checkInDate: '',
    checkOutDate: '',
    packageType: 'couple',
    guestComposition: { adults: 2, children: 0 },
    bookedBy: { name: '', staffId: '' },
    staffNames: [],
    totalAmount: 0,
    notes: ''
  });

  const [staffOptions, setStaffOptions] = useState([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch staff names on load
  useEffect(() => {
    fetchStaffNames();
  }, []);

  const fetchStaffNames = async () => {
    try {
      const response = await api.get('/bookings/staff-names');
      console.log('[ManualBooking] Staff names fetched:', response.data.staffNames);
      const names = response.data.staffNames || [];
      setStaffOptions(names);
      setFormData(prev => ({
        ...prev,
        staffNames: names
      }));
    } catch (error) {
      console.error('[ManualBooking] Error fetching staff:', error);
      setMessage('Error loading staff names');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.startsWith('adults') || name.startsWith('children') || name.startsWith('guestComposition.')) {
      const key = name.replace('guestComposition.', '');
      setFormData(prev => ({
        ...prev,
        guestComposition: {
          ...prev.guestComposition,
          [key]: parseInt(value) || 0
        }
      }));
    } else if (name.startsWith('bookedBy.')) {
      const key = name.replace('bookedBy.', '');
      const selectedStaff = staffOptions.find(s => s.name === value);
      setFormData(prev => ({
        ...prev,
        bookedBy: {
          name: value,
          staffId: selectedStaff?.id || ''
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) {
      setMessage('Staff name required');
      return;
    }

    try {
      const response = await api.post('/bookings/staff-names', {
        name: newStaffName
      });

      console.log('[ManualBooking] Staff added:', response.data.staff);
      
      const newStaff = response.data.staff;
      const updatedNames = response.data.staffNames || [...formData.staffNames, newStaff];
      setFormData(prev => ({
        ...prev,
        staffNames: updatedNames
      }));
      setStaffOptions(updatedNames);
      setNewStaffName('');
      setShowAddStaff(false);
      setMessage('Staff added successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('[ManualBooking] Error adding staff:', error);
      setMessage('Error adding staff');
    }
  };

  const handleDeleteStaff = async (staffId) => {
    try {
      const response = await api.delete(`/bookings/staff-names/${staffId}`);
      
      console.log('[ManualBooking] Staff deleted:', staffId);
      
      const updated = response.data.staffNames || formData.staffNames.filter(s => s.id !== staffId);
      setFormData(prev => ({
        ...prev,
        staffNames: updated,
        bookedBy: prev.bookedBy.staffId === staffId ? { name: '', staffId: '' } : prev.bookedBy
      }));
      setStaffOptions(updated);
      setMessage('Staff removed');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('[ManualBooking] Error deleting staff:', error);
      setMessage('Error removing staff');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (!formData.customerName || !formData.customerPhone) {
      setMessage('Customer name and phone required');
      setLoading(false);
      return;
    }

    if (!formData.checkInDate || !formData.checkOutDate) {
      setMessage('Check-in and check-out dates required');
      setLoading(false);
      return;
    }

    if (!formData.bookedBy.name) {
      setMessage('Please select staff member');
      setLoading(false);
      return;
    }

    try {
      console.log('[ManualBooking] Submitting booking:', formData);
      
      const response = await api.post('/bookings/manual-booking', formData);

      console.log('[ManualBooking] Booking created:', response.data.booking);
      
      setMessage('✅ Booking created successfully!');
      
      // Reset form
      setTimeout(() => {
        setFormData({
          customerName: '',
          customerPhone: '',
          checkInDate: '',
          checkOutDate: '',
          packageType: 'couple',
          guestComposition: { adults: 2, children: 0 },
          bookedBy: { name: '', staffId: '' },
          staffNames: formData.staffNames,
          totalAmount: 0,
          notes: ''
        });
        setMessage('');
      }, 2000);

    } catch (error) {
      console.error('[ManualBooking] Error:', error.response?.data || error.message);
      setMessage(error.response?.data?.error || 'Error creating booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="manual-booking-container">
      <h2>📝 Manual Booking Form</h2>
      
      {message && <div className="message">{message}</div>}

      <form onSubmit={handleSubmit}>
        
        {/* CUSTOMER INFO */}
        <div className="form-section">
          <h3>Customer Information</h3>
          <input
            type="text"
            name="customerName"
            placeholder="Customer Name"
            value={formData.customerName}
            onChange={handleInputChange}
            required
          />
          <input
            type="text"
            name="customerPhone"
            placeholder="Phone Number"
            value={formData.customerPhone}
            onChange={handleInputChange}
            required
          />
        </div>

        {/* DATES */}
        <div className="form-section">
          <h3>Booking Dates</h3>
          <label>Check-in Date:</label>
          <input
            type="date"
            name="checkInDate"
            value={formData.checkInDate}
            onChange={handleInputChange}
            required
          />
          
          <label>Check-out Date:</label>
          <input
            type="date"
            name="checkOutDate"
            value={formData.checkOutDate}
            onChange={handleInputChange}
            required
          />
        </div>

        {/* PACKAGE TYPE */}
        <div className="form-section">
          <h3>Package Type</h3>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                name="packageType"
                value="couple"
                checked={formData.packageType === 'couple'}
                onChange={handleInputChange}
              />
              Couple Stay
            </label>
            <label>
              <input
                type="radio"
                name="packageType"
                value="group"
                checked={formData.packageType === 'group'}
                onChange={handleInputChange}
              />
              Group Stay
            </label>
            <label>
              <input
                type="radio"
                name="packageType"
                value="oneDay"
                checked={formData.packageType === 'oneDay'}
                onChange={handleInputChange}
              />
              One Day Picnic
            </label>
          </div>
        </div>

        {/* GUEST COMPOSITION */}
        <div className="form-section">
          <h3>Guest Composition</h3>
          <div className="guest-row">
            <div>
              <label>Adults:</label>
              <input
                type="number"
                name="guestComposition.adults"
                value={formData.guestComposition.adults}
                onChange={handleInputChange}
                min="1"
                required
              />
            </div>
            <div>
              <label>Children:</label>
              <input
                type="number"
                name="guestComposition.children"
                value={formData.guestComposition.children}
                onChange={handleInputChange}
                min="0"
              />
            </div>
          </div>
          <p className="summary">
            Total: {formData.guestComposition.adults} Adults + {formData.guestComposition.children} Children
          </p>
        </div>

        {/* BOOKED BY STAFF */}
        <div className="form-section">
          <h3>Booked By (Staff)</h3>
          
          <div className="staff-selection">
            <label>Select Staff:</label>
            <select
              name="bookedBy.name"
              value={formData.bookedBy.name}
              onChange={handleInputChange}
              required
            >
              <option value="">-- Select Staff Member --</option>
              {formData.staffNames.map(staff => (
                <option key={staff.id} value={staff.name}>
                  {staff.name}
                </option>
              ))}
            </select>
          </div>

          <div className="staff-list">
            <h4>📋 Staff Members:</h4>
            {formData.staffNames.map(staff => (
              <div key={staff.id} className="staff-item">
                <span className="staff-name">
                  {formData.bookedBy.name === staff.name && '✓ '}
                  {staff.name}
                </span>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => handleDeleteStaff(staff.id)}
                  title="Delete staff"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {!showAddStaff ? (
            <button
              type="button"
              className="add-staff-btn"
              onClick={() => setShowAddStaff(true)}
            >
              + Add New Staff
            </button>
          ) : (
            <div className="add-staff-form">
              <input
                type="text"
                placeholder="New staff name"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
              />
              <button
                type="button"
                className="save-btn"
                onClick={handleAddStaff}
              >
                Save
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setShowAddStaff(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* NOTES */}
        <div className="form-section">
          <h3>Notes (Optional)</h3>
          <textarea
            name="notes"
            placeholder="Any special requests? Extra mattress? Birthday celebration? Write here..."
            value={formData.notes}
            onChange={handleInputChange}
            rows="5"
            maxLength="500"
          />
          <small>{formData.notes.length}/500</small>
        </div>

        {/* AMOUNT */}
        <div className="form-section">
          <label>Total Amount:</label>
          <input
            type="number"
            name="totalAmount"
            placeholder="₹ Amount"
            value={formData.totalAmount}
            onChange={handleInputChange}
            required
          />
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          className="submit-btn"
          disabled={loading}
        >
          {loading ? 'Creating...' : '✓ Create Booking'}
        </button>
      </form>
    </div>
  );
};

export default ManualBookingForm;
