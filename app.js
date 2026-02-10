const { useState, useEffect, useRef, useMemo } = React;
const { createClient } = supabase;

// ==========================================
// 1. CONFIGURATION & SERVICES
// ==========================================
const SUPABASE_URL = "https://iwgkkgvspqpzqkawcavx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3Z2trZ3ZzcHFwenFrYXdjYXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjQzNzgsImV4cCI6MjA4NjIwMDM3OH0.wNLG0O4o7ZcYcK3U78IcYuNjatVRUrXNbpTh9tsNwYE";
const PAYMENT_PHONE = "3096610521";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. CORE UTILITIES
// ==========================================
const formatCurrency = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const calculateSessionPayout = (session) => {
    const rate = session.hourly_rate || 75;
    const duration = session.duration || 60;
    return (rate * duration) / 60;
};

const getStatusColor = (isPaid, isPast) => {
    if (isPaid) return 'var(--success)';
    if (isPast) return 'var(--secondary)';
    return 'var(--primary)';
};

// ==========================================
// 3. UI ATOMS & HELPERS
// ==========================================

const DateTimeInput = ({ label, name, value, onChange, required, placeholder }) => {
    const inputRef = useRef(null);
    return (
        <div>
            <label>{label}</label>
            <div className="datetime-input-group">
                <input
                    ref={inputRef}
                    type="datetime-local"
                    name={name}
                    value={value || ''}
                    onChange={onChange}
                    required={required}
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    className="btn-ok"
                    onClick={() => inputRef.current?.blur()}
                    title="Confirm Date & Time"
                >OK</button>
            </div>
        </div>
    );
};

// ==========================================
// 4. COMPONENTS
// ==========================================

const Sidebar = ({ currentView, setView }) => {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large' },
        { id: 'students', label: 'Students', icon: 'fa-users' },
        { id: 'calendar', label: 'Calendar', icon: 'fa-calendar-alt' },
    ];

    return (
        <div className="sidebar">
            <div className="logo">
                <i className="fas fa-graduation-cap"></i>
                <span>Apex Manager</span>
            </div>
            <nav>
                {menuItems.map(item => (
                    <div
                        key={item.id}
                        className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                        onClick={() => setView(item.id)}
                    >
                        <i className={`fas ${item.icon}`}></i>
                        {item.label}
                    </div>
                ))}
            </nav>
            <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
                <div className="glass-card" style={{ padding: '1rem', fontSize: '0.8rem' }}>
                    <p style={{ marginBottom: '0.5rem' }}>Payment Info</p>
                    <p><strong>Zelle/Venmo:</strong></p>
                    <p style={{ color: 'var(--text-main)' }}>{PAYMENT_PHONE}</p>
                </div>
            </div>
        </div>
    );
};

const Header = ({ title, status, errorMessage, onAction }) => {
    const getStatusIcon = () => {
        if (status === 'loading') return <i className="fas fa-spinner fa-spin text-blue-400"></i>;
        if (status === 'error') return <i className="fas fa-exclamation-triangle text-red-400"></i>;
        return <i className="fas fa-check-circle text-green-400"></i>;
    };

    return (
        <div className="flex justify-between items-center mb-8">
            <div>
                <h1>{title}</h1>
                <p className="flex items-center gap-2">
                    {getStatusIcon()} {status === 'error' ? errorMessage : 'System Active'}
                </p>
            </div>
            {onAction && (
                <button className="btn btn-primary" onClick={onAction.handler}>
                    <i className={`fas ${onAction.icon}`}></i> {onAction.label}
                </button>
            )}
        </div>
    );
};

const StatCard = ({ label, value, trend, icon, color }) => (
    <div className="glass-card flex items-center gap-4">
        <div className="p-3" style={{ background: color, borderRadius: '12px', color: 'white' }}>
            <i className={`fas ${icon} fa-lg`}></i>
        </div>
        <div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <h3 className="text-xl" style={{ margin: 0 }}>{value}</h3>
            {trend && <p className="text-xs mt-1" style={{ color: trend.startsWith('+') ? 'var(--success)' : 'var(--secondary)' }}>{trend}</p>}
        </div>
    </div>
);

const SessionItem = ({ session, students, onAction }) => {
    const student = students.find(s => s.id === session.student_id);
    return (
        <div className="glass-card flex justify-between items-center py-3 px-4 mb-2 hover:bg-glass-hover transition-all">
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span className="font-bold">{student?.name || 'Unknown'}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        #{session.session_number || '?'}
                    </span>
                </div>
                <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                    {new Date(session.session_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
            </div>
            <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => onAction('view', student)}><i className="fas fa-user-circle"></i></button>
                <button className="btn btn-primary btn-sm" onClick={() => onAction('log', session)}>Log</button>
            </div>
        </div>
    );
};

// New Financial Visualization Component
const PayoutCloud = ({ sessions, title, type }) => {
    // Group earnings by day for the last/next 30 days
    const days = 30;
    const data = useMemo(() => {
        const counts = Array(days).fill(0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        sessions.forEach(s => {
            const sessDate = new Date(s.session_date);
            const diffTime = Math.abs(sessDate - now);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < days) {
                const payout = calculateSessionPayout(s);
                // For past: index 0 is today, 29 is 29 days ago. Reversed for rendering.
                counts[type === 'past' ? (days - 1 - diffDays) : diffDays] += payout;
            }
        });
        return counts;
    }, [sessions, type]);

    const max = Math.max(...data, 100);
    const total = data.reduce((a, b) => a + b, 0);

    return (
        <div className="glass-card flex flex-col gap-4">
            <div className="flex justify-between items-end">
                <div>
                    <h3 style={{ fontSize: '1rem', color: type === 'past' ? 'var(--success)' : 'var(--primary)' }}>{title}</h3>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{formatCurrency(total)}</p>
                </div>
                <span className="text-xs text-muted">{type === 'past' ? 'Last 30 Days' : 'Next 30 Days'}</span>
            </div>
            <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                {data.map((h, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            height: `${(h / max) * 100}%`,
                            background: type === 'past' ? 'var(--success)' : 'var(--primary)',
                            opacity: 0.3 + (i / days) * 0.7,
                            borderRadius: '2px'
                        }}
                        title={formatCurrency(h)}
                    />
                ))}
            </div>
        </div>
    );
};

const StudentList = ({ students, onSelect, onLogSession }) => (
    <div className="glass-card mt-4 table-container">
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Level</th>
                    <th>Next Session</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                {students.map(student => (
                    <tr key={student.id}>
                        <td
                            style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--primary)' }}
                            onClick={() => onSelect(student)}
                        >
                            {student.name}
                        </td>
                        <td><span className="badge badge-purple">{student.level}</span></td>
                        <td>{student.next_session ? new Date(student.next_session).toLocaleDateString() : 'Not Scheduled'}</td>
                        <td>
                            <div className="flex gap-2">
                                <button className="btn btn-ghost btn-sm" title="Log Session" onClick={() => onLogSession(student)}>
                                    <i className="fas fa-calendar-check text-blue-400"></i>
                                </button>
                                <button className="btn btn-ghost btn-sm" title="View Profile" onClick={() => onSelect(student)}>
                                    <i className="fas fa-chevron-right text-muted"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const StudentProfile = ({ student, sessions, onEdit, onLogSession, onScheduleSession, onBack }) => {
    const upcomingSessions = sessions.filter(s => new Date(s.session_date) >= new Date().setHours(0, 0, 0, 0)).sort((a, b) => new Date(a.session_date) - new Date(b.session_date));
    const pastSessions = sessions.filter(s => new Date(s.session_date) < new Date().setHours(0, 0, 0, 0)).sort((a, b) => new Date(b.session_date) - new Date(a.session_date));

    return (
        <div>
            <div className="flex items-center gap-4 mb-8">
                <button className="btn btn-ghost btn-sm" onClick={onBack}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2>{student.name}'s Profile</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="glass-card md:col-span-2">
                    <div className="flex justify-between items-start mb-4">
                        <h3>Academic Information</h3>
                        <div className="flex gap-2">
                            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(student)}>
                                <i className="fas fa-edit"></i> Edit Info
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label>Level</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{student.level}</p>
                        </div>
                        <div>
                            <label>School</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{student.school || 'N/A'}</p>
                        </div>
                        <div>
                            <label>Subject/Topic</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{student.subject || 'N/A'}</p>
                        </div>
                        <div>
                            <label>Pricing Rate</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{formatCurrency(student.pricing || student.pay_rate || 75)}/hr</p>
                        </div>
                        <div>
                            <label>Session Frequency</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{student.frequency || 'N/A'}</p>
                        </div>
                        <div>
                            <label>First Session Date</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>
                                {student.first_session_date ? new Date(student.first_session_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set'}
                            </p>
                        </div>
                        <div>
                            <label>Parent/Guardian</label>
                            <p className="text-main" style={{ color: 'var(--text-main)' }}>{student.parent_name || 'N/A'}</p>
                        </div>
                        <div>
                            <label>Parent Contact</label>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{student.parent_email} | {student.parent_phone}</p>
                        </div>
                        {student.questions && (
                            <div className="md:col-span-2">
                                <label>Enrollment Questions/Notes</label>
                                <p className="text-sm italic" style={{ color: 'var(--text-muted)', background: 'var(--glass)', padding: '0.75rem', borderRadius: '8px' }}>
                                    "{student.questions}"
                                </p>
                            </div>
                        )}
                        <div className="md:col-span-2">
                            <label>Current HW / Focus</label>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                {student.homework_assigned ? `HW: ${student.homework_assigned}` : 'No homework pending'}
                                {student.next_session_focus ? ` | Focus: ${student.next_session_focus}` : ''}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="glass-card">
                    <h3>Quick Actions</h3>
                    <div className="flex flex-col gap-3 mt-4">
                        <button className="btn btn-primary w-full justify-start" onClick={() => onLogSession(student)}>
                            <i className="fas fa-plus"></i> Log Completed Session
                        </button>
                        <button className="btn btn-ghost w-full justify-start" style={{ border: '1px solid var(--primary)' }} onClick={() => onScheduleSession(student)}>
                            <i className="fas fa-clock"></i> Schedule New Session
                        </button>
                        <a href={`mailto:${student.parent_email}?subject=Session Reminder for ${student.name}&body=Hi,%0D%0A%0D%0AThis is a reminder for our upcoming session for ${student.name}.%0D%0A%0D%0APayment can be made via Zelle/Venmo to ${PAYMENT_PHONE}.%0D%0A%0D%0ASee you then!`} className="btn btn-ghost w-full justify-start">
                            <i className="fas fa-paper-plane"></i> Send Reminder
                        </a>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-8">
                <section>
                    <h3 className="mb-4 text-blue-400"><i className="fas fa-calendar-alt mr-2"></i>Upcoming Sessions</h3>
                    <SessionHistory sessions={upcomingSessions} onAction={onLogSession} />
                </section>

                <section>
                    <h3 className="mb-4 text-gray-400"><i className="fas fa-history mr-2"></i>Past History</h3>
                    <SessionHistory sessions={pastSessions} onAction={onLogSession} />
                </section>
            </div>
        </div>
    );
};

const SessionModal = ({ session, onClose }) => {
    if (!session) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-calendar-check text-blue-400 text-xl"></i>
                        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Session Details</h2>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body">
                    <div key={session.id} className="flex justify-between items-center p-3 border-b border-border hover:bg-glass transition-colors">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium">#{session.session_number || '?'}</span>
                                <span className="text-xs text-muted-foreground" style={{ color: 'var(--text-muted)' }}>
                                    {new Date(session.session_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                            </div>
                            <p className="text-sm italic mt-1" style={{ color: 'var(--text-muted)' }}>{session.notes || 'No notes'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${session.paid ? 'bg-success/20 text-success border-success/30' : 'bg-secondary/20 text-secondary border-secondary/30'} border`}>
                                {session.paid ? 'PAID' : 'PENDING'}
                            </span>
                            <button className="btn btn-ghost btn-xs" onClick={() => onLogSession(session)}><i className="fas fa-edit"></i></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4" style={{ background: 'var(--glass)', padding: '1rem', borderRadius: '12px' }}>
                        <div className="session-detail-item">
                            <label>Rate</label>
                            <p className="font-bold">{formatCurrency(session.hourly_rate)}/hr</p>
                        </div>
                        <div className="session-detail-item">
                            <label>Total Payout</label>
                            <p className="font-bold text-green-400">{formatCurrency(calculateSessionPayout(session))}</p>
                        </div>
                    </div>

                    <div className="session-detail-item">
                        <label>Topics Covered</label>
                        <p style={{ background: 'var(--glass)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            {session.topics_covered || 'No topics listed.'}
                        </p>
                    </div>

                    {session.attachment_urls && session.attachment_urls.length > 0 && (
                        <div className="session-detail-item">
                            <label>Attachments ({session.attachment_urls.length})</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {session.attachment_urls.map((url, idx) => (
                                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="attachment-chip">
                                        <i className="fas fa-file-pdf text-red-400"></i>
                                        <span>Document {idx + 1}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-glass border-t border-glass flex justify-end">
                    <button className="btn btn-primary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

const SessionHistory = ({ sessions, onAction }) => {
    const [selectedSession, setSelectedSession] = useState(null);
    const isPast = (date) => new Date(date) < new Date().setHours(0, 0, 0, 0);

    return (
        <div className="flex flex-col gap-4">
            {sessions.length === 0 ? (
                <div className="glass-card text-center p-6">
                    <p className="text-gray-400 italic" style={{ fontSize: '0.85rem' }}>No sessions found.</p>
                </div>
            ) : (
                sessions.map(session => (
                    <div
                        key={session.id}
                        className="glass-card flex justify-between items-center"
                        style={{ borderLeft: `4px solid ${getStatusColor(session.paid, isPast(session.session_date))}`, cursor: 'pointer', padding: '1rem' }}
                    >
                        <div className="flex-1" onClick={() => setSelectedSession(session)}>
                            <div className="flex items-center gap-3">
                                <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                                    {new Date(session.session_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {formatCurrency(session.hourly_rate)}/hr • {session.duration}m • {formatCurrency(calculateSessionPayout(session))}
                                </span>
                                {session.paid && <i className="fas fa-check-circle text-green-400 text-xs"></i>}
                            </div>
                            {session.topics_covered && <p className="line-clamp-1 mt-2 mb-0 text-sm">{session.topics_covered}</p>}
                            {!session.topics_covered && !isPast(session.session_date) && (
                                <p className="mt-2 mb-0 text-xs text-blue-400 italic">Scheduled session</p>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onAction(session); }}>
                                {session.topics_covered ? 'Edit' : 'Log'}
                            </button>
                            <i className="fas fa-chevron-right text-xs text-muted" onClick={() => setSelectedSession(session)}></i>
                        </div>
                    </div>
                ))
            )}
            {selectedSession && <SessionModal session={selectedSession} onClose={() => setSelectedSession(null)} />}
        </div>
    );
};

const StudentForm = ({ onSave, onCancel, initialData }) => {
    const [formData, setFormData] = useState(initialData || {
        name: '', school: '', level: 'AP',
        subject: '', frequency: '', questions: '',
        first_session_date: '', pricing: 75,
        parent_name: '', parent_phone: '', parent_email: '',
        student_phone: '', student_email: '',
        notes: ''
    });

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? Number(value) : value
        }));
    };

    return (
        <div className="glass-card" style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, background: 'linear-gradient(to right, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {initialData ? 'Elite Student Profile' : 'New Scholar Enrollment'}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please provide detailed information for the academic intake.</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} style={{ fontSize: '1.2rem' }}><i className="fas fa-times"></i></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="flex flex-col gap-8">
                <section className="form-section">
                    <div className="form-section-header">
                        <i className="fas fa-graduation-cap"></i> Academic Foundation
                    </div>
                    <div className="form-grid">
                        <div className="input-wrapper">
                            <label>Student's Full Name</label>
                            <input name="name" value={formData.name || ''} onChange={handleChange} required placeholder="Enter full name" />
                        </div>
                        <div className="input-wrapper">
                            <label>School Name</label>
                            <input name="school" value={formData.school || ''} onChange={handleChange} placeholder="e.g. Apex High" />
                        </div>
                        <div className="input-wrapper">
                            <label>Academic Level</label>
                            <select name="level" value={formData.level || 'AP'} onChange={handleChange}>
                                <option value="AP">AP Chemistry</option>
                                <option value="Hons (School based)">Honors</option>
                                <option value="Regular">Regular</option>
                                <option value="College">College</option>
                            </select>
                        </div>
                        <div className="input-wrapper">
                            <label>Primary Focus / Subject</label>
                            <input name="subject" value={formData.subject || ''} onChange={handleChange} placeholder="e.g. Organic Chem" />
                        </div>
                        <div className="input-wrapper">
                            <label>Session Frequency</label>
                            <input name="frequency" value={formData.frequency || ''} onChange={handleChange} placeholder="e.g. 2x / Week" />
                        </div>
                        <div className="input-wrapper">
                            <label>Hourly Rate</label>
                            <select name="pricing" value={formData.pricing} onChange={handleChange} style={{ borderColor: 'var(--success)' }}>
                                <option value={75}>Elite - $75/hr</option>
                                <option value={100}>Premium - $100/hr</option>
                            </select>
                        </div>
                    </div>
                </section>

                <section className="form-section">
                    <div className="form-section-header">
                        <i className="fas fa-address-book"></i> Guarding & Contact Details
                    </div>
                    <div className="form-grid">
                        <div className="input-wrapper">
                            <label>Parent/Guardian Name</label>
                            <input name="parent_name" value={formData.parent_name || ''} onChange={handleChange} placeholder="Full name" />
                        </div>
                        <div className="input-wrapper">
                            <label>Parent Email</label>
                            <input type="email" name="parent_email" value={formData.parent_email || ''} onChange={handleChange} placeholder="email@example.com" />
                        </div>
                        <div className="input-wrapper">
                            <label>Parent Phone</label>
                            <input name="parent_phone" value={formData.parent_phone || ''} onChange={handleChange} placeholder="(555) 000-0000" />
                        </div>
                        <div className="input-wrapper">
                            <label>Student Email</label>
                            <input type="email" name="student_email" value={formData.student_email || ''} onChange={handleChange} />
                        </div>
                        <div className="input-wrapper">
                            <label>Student Phone</label>
                            <input name="student_phone" value={formData.student_phone || ''} onChange={handleChange} />
                        </div>
                    </div>
                </section>

                <section className="form-section">
                    <div className="form-section-header">
                        <i className="fas fa-calendar-star"></i> Intake Insights
                    </div>
                    <div className="flex flex-col gap-4">
                        <DateTimeInput label="Requested Start Date & Time" name="first_session_date" value={formData.first_session_date} onChange={handleChange} />
                        <div className="input-wrapper">
                            <label>Questions or Specific Objectives for Dr Sahota</label>
                            <textarea name="questions" rows="4" value={formData.questions || ''} onChange={handleChange} placeholder="Describe specific academic goals, weak areas, or past performance..."></textarea>
                        </div>
                    </div>
                </section>

                <div className="flex gap-4 mt-4">
                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Save Record</button>
                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

const SessionLogForm = ({ student, session, onSave, onCancel }) => {
    const [nextSessionNum, setNextSessionNum] = useState(session?.session_number || null);
    const [formData, setFormData] = useState({
        session_date: session ? new Date(session.session_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        topics_covered: session?.topics_covered || '',
        next_session_date: '',
        next_session_focus: '',
        homework_assigned: session?.homework_assigned || '',
        duration: session?.duration || 60,
        hourly_rate: session?.hourly_rate || student.pricing || student.pay_rate || 75,
        paid: session?.paid || false
    });
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!session) {
            const fetchNextNum = async () => {
                const { count, error } = await supabaseClient
                    .from('sessions')
                    .select('*', { count: 'exact', head: true })
                    .eq('student_id', student.id);
                if (!error) setNextSessionNum((count || 0) + 1);
            };
            fetchNextNum();
        }
    }, [student.id, session]);

    return (
        <div className="glass-card" style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                        <i className="fas fa-calendar-check text-2xl"></i>
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                            {session ? `Update Session #${session.session_number}` : `Log Session #${nextSessionNum || '...'}`}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                {student.name}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                                {student.level}
                            </span>
                        </div>
                    </div>
                </div>
                {nextSessionNum && (
                    <div className="flex flex-col items-end">
                        <span className="text-xs uppercase tracking-widest text-muted">Session</span>
                        <span className="text-2xl font-black text-primary">#{nextSessionNum}</span>
                    </div>
                )}
            </div>

            <form onSubmit={async (e) => {
                e.preventDefault();
                setUploading(true);
                await onSave({ ...formData, session_number: nextSessionNum }, files, session?.id);
                setUploading(false);
            }} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <DateTimeInput
                            label="Date & Time"
                            value={formData.session_date}
                            onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label>Duration</label>
                        <select value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}>
                            <option value={30}>30 min</option>
                            <option value={60}>60 min</option>
                            <option value={90}>90 min</option>
                        </select>
                    </div>
                    <div>
                        <label>Hourly Rate</label>
                        <select value={formData.hourly_rate} onChange={(e) => setFormData({ ...formData, hourly_rate: Number(e.target.value) })}>
                            <option value={75}>$75/hr</option>
                            <option value={100}>$100/hr</option>
                        </select>
                    </div>
                </div>


                <div className="flex items-center gap-3 p-3 glass-card" style={{ background: formData.paid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.05)' }}>
                    <input
                        type="checkbox"
                        id="paid-toggle"
                        checked={formData.paid}
                        onChange={(e) => setFormData({ ...formData, paid: e.target.checked })}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                    <label htmlFor="paid-toggle" style={{ margin: 0, cursor: 'pointer', color: formData.paid ? 'var(--success)' : 'var(--secondary)' }}>
                        <strong>{formData.paid ? 'Session Paid' : 'Pending Payment'}</strong>
                        <span className="block text-xs opacity-70">Total Earnings: {formatCurrency(calculateSessionPayout(formData))}</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label>Topics Covered</label>
                        <textarea rows="3" value={formData.topics_covered} onChange={(e) => setFormData({ ...formData, topics_covered: e.target.value })} placeholder="What was discussed?"></textarea>
                    </div>
                    <div>
                        <label>Homework Assigned (Public)</label>
                        <textarea rows="3" value={formData.homework_assigned} onChange={(e) => setFormData({ ...formData, homework_assigned: e.target.value })} placeholder="Exercises..."></textarea>
                    </div>
                </div>

                <div className="p-4 glass-card border-primary" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <h4 className="mb-3 text-sm text-primary flex items-center gap-2">
                        <i className="fas fa-forward"></i> Next Session Planning
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DateTimeInput
                            label="Target Next Date"
                            value={formData.next_session_date}
                            onChange={(e) => setFormData({ ...formData, next_session_date: e.target.value })}
                        />
                        <div className="input-wrapper">
                            <label>Next Session Focus</label>
                            <input
                                value={formData.next_session_focus}
                                onChange={(e) => setFormData({ ...formData, next_session_focus: e.target.value })}
                                placeholder="e.g. Test Prep, New Unit"
                            />
                        </div>
                    </div>
                </div>

                <div className="input-wrapper">
                    <label className="flex items-center gap-2">
                        <i className="fas fa-paperclip"></i> Attachments / Lesson Materials
                    </label>
                    <div className="flex flex-col gap-2">
                        <input
                            type="file"
                            multiple
                            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
                            onChange={(e) => setFiles(Array.from(e.target.files))}
                        />
                        {files.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                                {files.map((file, i) => (
                                    <span key={i} className="text-xs px-2 py-1 bg-white/5 rounded border border-white/10 flex items-center gap-2">
                                        <i className="fas fa-file text-primary"></i> {file.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-4 mt-4">
                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={uploading}>
                        {uploading ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : <><i className="fas fa-save mr-2"></i>Save Session</>}
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

const ScheduleSessionForm = ({ students, student, onSave, onCancel }) => {
    const [nextSessionNum, setNextSessionNum] = useState(null);
    const initialStudentId = student ? student.id : (students[0]?.id || '');

    const [formData, setFormData] = useState({
        student_id: initialStudentId,
        session_date: '',
        duration: 60,
        hourly_rate: student?.pricing || student?.pay_rate || 75
    });

    useEffect(() => {
        const fetchNextNum = async () => {
            const sid = formData.student_id;
            if (!sid) return;
            const { count, error } = await supabaseClient
                .from('sessions')
                .select('*', { count: 'exact', head: true })
                .eq('student_id', sid);
            if (!error) setNextSessionNum((count || 0) + 1);
        };
        fetchNextNum();
    }, [formData.student_id]);

    // Update rate when student changes (if selecting from list)
    useEffect(() => {
        if (!student) {
            const selected = students.find(s => s.id === formData.student_id);
            if (selected) {
                setFormData(prev => ({ ...prev, hourly_rate: selected.pricing || selected.pay_rate || 75 }));
            }
        }
    }, [formData.student_id, students, student]);

    const handleSave = () => {
        onSave({
            ...formData,
            session_number: nextSessionNum
        });
    };

    return (
        <div className="glass-card" style={{ maxWidth: 500, margin: '0 auto' }}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                        <i className="fas fa-calendar-plus text-2xl"></i>
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                            {nextSessionNum ? `Schedule Session #${nextSessionNum}` : 'Schedule Session'}
                        </h2>
                        {student && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                    {student.name}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                                    {student.level}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                {nextSessionNum && (
                    <div className="flex flex-col items-end">
                        <span className="text-xs uppercase tracking-widest text-muted">Next up</span>
                        <span className="text-2xl font-black text-primary">#{nextSessionNum}</span>
                    </div>
                )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex flex-col gap-6">
                {!student && (
                    <div className="input-wrapper">
                        <label>Select Student</label>
                        <select
                            value={formData.student_id}
                            onChange={(e) => setFormData({ ...formData, student_id: Number(e.target.value) })}
                            required
                        >
                            {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.level})</option>)}
                        </select>
                    </div>
                )}

                <div className="form-section" style={{ padding: '1rem', background: 'transparent' }}>
                    <div className="flex flex-col gap-5">
                        <DateTimeInput
                            label="Target Date & Time"
                            value={formData.session_date}
                            onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                            required
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <div className="input-wrapper">
                                <label>Duration</label>
                                <select value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}>
                                    <option value={30}>30 min</option>
                                    <option value={60}>60 min</option>
                                    <option value={90}>90 min</option>
                                </select>
                            </div>
                            <div className="input-wrapper">
                                <label>Hourly Rate</label>
                                <select value={formData.hourly_rate} onChange={(e) => setFormData({ ...formData, hourly_rate: Number(e.target.value) })}>
                                    <option value={75}>$75/hr</option>
                                    <option value={100}>$100/hr</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 mt-2">
                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Schedule Session</button>
                    <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

const CalendarView = ({ allSessions, onSelectEvent }) => {
    const [viewDate, setViewDate] = useState(new Date());

    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const prevMonthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0);

    const startDay = startOfMonth.getDay();
    const totalDays = endOfMonth.getDate();

    const calendarDays = [];
    for (let i = startDay - 1; i >= 0; i--) {
        calendarDays.push({ day: prevMonthEnd.getDate() - i, month: 'prev', date: new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, prevMonthEnd.getDate() - i) });
    }
    for (let i = 1; i <= totalDays; i++) {
        calendarDays.push({ day: i, month: 'current', date: new Date(viewDate.getFullYear(), viewDate.getMonth(), i) });
    }
    const remaining = 42 - calendarDays.length;
    for (let i = 1; i <= remaining; i++) {
        calendarDays.push({ day: i, month: 'next', date: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i) });
    }

    const changeMonth = (offset) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));

    const isToday = (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3>{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                <div className="flex gap-2">
                    <button className="btn btn-ghost" onClick={() => changeMonth(-1)}><i className="fas fa-chevron-left"></i></button>
                    <button className="btn btn-ghost" onClick={() => setViewDate(new Date())}>Today</button>
                    <button className="btn btn-ghost" onClick={() => changeMonth(1)}><i className="fas fa-chevron-right"></i></button>
                </div>
            </div>

            <div className="calendar-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="calendar-header-day">{d}</div>)}
                {calendarDays.map((d, i) => {
                    const dateStr = d.date.toISOString().split('T')[0];
                    const daySessions = allSessions.filter(s => s.session_date && s.session_date.split('T')[0] === dateStr);

                    return (
                        <div key={i} className={`calendar-day ${d.month !== 'current' ? 'other-month' : ''} ${isToday(d.date) ? 'today' : ''}`}>
                            <span className="day-number">{d.day}</span>
                            {daySessions.map(s => (
                                <div key={s.id} className="calendar-event" onClick={() => onSelectEvent(s.student_id)}>
                                    <div className="flex justify-between">
                                        <span style={{ fontWeight: 600 }}>{s.paid ? '$\u2713' : '$?'}</span>
                                        <span style={{ opacity: 0.8 }}>{new Date(s.session_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ==========================================
// 5. MAIN APPLICATION
// ==========================================

const App = () => {
    const [students, setStudents] = useState([]);
    const [allSessions, setAllSessions] = useState([]);
    const [view, setView] = useState('dashboard');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedSession, setSelectedSession] = useState(null);
    const [selectedStudentSessions, setSelectedStudentSessions] = useState([]);
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setStatus('loading');
        try {
            const [stdRes, sessRes] = await Promise.all([
                supabaseClient.from('students').select('*').order('name'),
                supabaseClient.from('sessions').select('*').order('session_date', { ascending: false })
            ]);

            if (stdRes.error) throw stdRes.error;
            if (sessRes.error) throw sessRes.error;

            setStudents(stdRes.data || []);
            setAllSessions(sessRes.data || []);
            setStatus('connected');
        } catch (err) {
            setStatus('error');
            setErrorMessage(err.message);
        }
    };

    const handleStudentClick = (studentId) => {
        const student = students.find(s => s.id === (typeof studentId === 'object' ? studentId.id : studentId));
        if (!student) return;
        setSelectedStudent(student);
        setSelectedStudentSessions(allSessions.filter(s => s.student_id === student.id));
        setView('student-profile');
    };

    const handleLogSession = (target) => {
        if (target.student_id) { // It's a session object
            const std = students.find(s => s.id === target.student_id);
            setSelectedStudent(std);
            setSelectedSession(target);
        } else { // It's a student object
            setSelectedStudent(target);
            setSelectedSession(null);
        }
        setView('log-session');
    };

    // Financial calculations
    const now = new Date();
    const past30 = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const next30 = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    const paidLast30 = allSessions.filter(s => s.paid && new Date(s.session_date) >= past30 && new Date(s.session_date) <= now);
    const expectedNext30 = allSessions.filter(s => new Date(s.session_date) > now && new Date(s.session_date) <= next30);

    const studentsWithNextSess = useMemo(() => students.map(student => {
        const next = allSessions
            .filter(s => s.student_id === student.id && new Date(s.session_date) >= now.setHours(0, 0, 0, 0))
            .sort((a, b) => new Date(a.session_date) - new Date(b.session_date))[0];
        return { ...student, next_session: next?.session_date };
    }), [students, allSessions]);

    return (
        <React.Fragment>
            <Sidebar currentView={view} setView={setView} />
            <main className="main-content">
                {view === 'dashboard' && (
                    <React.Fragment>
                        <Header title="Apex Business Overview" status={status} errorMessage={errorMessage} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <PayoutCloud sessions={paidLast30} title="Revenue (Paid)" type="past" />
                            <PayoutCloud sessions={expectedNext30} title="Projected Revenue" type="next" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <StatCard title="Total Students" value={students.length} icon="fa-users" color="var(--primary)" onClick={() => setView('students')} />
                            <StatCard
                                title="Pending Sessions"
                                value={allSessions.filter(s => !s.paid && new Date(s.session_date) < now).length}
                                icon="fa-money-bill-wave"
                                color="var(--secondary)"
                                subtitle="Needs logging/payment"
                            />
                            <StatCard
                                title="Monthly Goal"
                                value={formatCurrency(2500)}
                                icon="fa-chart-line"
                                color="var(--success)"
                                subtitle={`${Math.round((paidLast30.reduce((a, b) => a + calculateSessionPayout(b), 0) / 2500) * 100)}% Reached`}
                            />
                        </div>

                        <div className="flex justify-between items-center mb-6">
                            <h3>Upcoming Pipeline</h3>
                            <button className="btn btn-primary btn-sm" onClick={() => setView('schedule-session')}>+ Schedule</button>
                        </div>
                        <StudentList
                            students={studentsWithNextSess.filter(s => s.next_session).sort((a, b) => new Date(a.next_session) - new Date(b.next_session)).slice(0, 5)}
                            onSelect={handleStudentClick}
                            onLogSession={handleLogSession}
                        />
                    </React.Fragment>
                )}

                {view === 'students' && (
                    <React.Fragment>
                        <Header title="Student Directory" status={status} onAction={{ label: 'New Student', icon: 'fa-user-plus', handler: () => setView('add-student') }} />
                        <StudentList students={studentsWithNextSess} onSelect={handleStudentClick} onLogSession={handleLogSession} />
                    </React.Fragment>
                )}

                {view === 'student-profile' && selectedStudent && (
                    <StudentProfile
                        student={selectedStudent}
                        sessions={selectedStudentSessions}
                        onEdit={(s) => { setSelectedStudent(s); setView('edit-student'); }}
                        onLogSession={handleLogSession}
                        onScheduleSession={(s) => { setSelectedStudent(s); setView('schedule-session'); }}
                        onBack={() => setView('students')}
                    />
                )}

                {view === 'calendar' && (
                    <React.Fragment>
                        <Header title="Academic Calendar" status={status} />
                        <CalendarView allSessions={allSessions} onSelectEvent={handleStudentClick} />
                    </React.Fragment>
                )}

                {view === 'add-student' && (
                    <StudentForm onSave={async (data) => {
                        const { error } = await supabaseClient.from('students').insert([data]);
                        if (!error) { fetchData(); setView('students'); }
                        else alert(error.message);
                    }} onCancel={() => setView('students')} />
                )}

                {view === 'edit-student' && selectedStudent && (
                    <StudentForm initialData={selectedStudent} onSave={async (data) => {
                        const { error } = await supabaseClient.from('students').update(data).eq('id', data.id);
                        if (!error) { fetchData(); setView('student-profile'); }
                        else alert(error.message);
                    }} onCancel={() => setView('student-profile')} />
                )}

                {view === 'log-session' && selectedStudent && (
                    <SessionLogForm student={selectedStudent} session={selectedSession} onSave={async (formData, files, sessionId) => {
                        try {
                            const { next_session_date, next_session_focus, ...sessionData } = formData;
                            const payload = { ...sessionData, student_id: selectedStudent.id };

                            if (sessionId) {
                                await supabaseClient.from('sessions').update(payload).eq('id', sessionId);
                            } else {
                                await supabaseClient.from('sessions').insert([payload]);
                            }

                            if (next_session_date) {
                                await supabaseClient.from('sessions').insert([{
                                    student_id: selectedStudent.id,
                                    session_date: next_session_date,
                                    hourly_rate: formData.hourly_rate,
                                    duration: 60
                                }]);
                            }

                            await supabaseClient.from('students').update({
                                next_session_focus: next_session_focus || '',
                                homework_assigned: formData.homework_assigned || ''
                            }).eq('id', selectedStudent.id);

                            fetchData();
                            setView('dashboard');
                            setSelectedSession(null);
                        } catch (err) {
                            alert(err.message);
                        }
                    }} onCancel={() => { setView('dashboard'); setSelectedSession(null); }} />
                )}

                {view === 'schedule-session' && (
                    <ScheduleSessionForm
                        students={students}
                        student={selectedStudent}
                        onSave={async (data) => {
                            const { error } = await supabaseClient.from('sessions').insert([data]);
                            if (!error) { fetchData(); setView('dashboard'); }
                            else alert(error.message);
                        }}
                        onCancel={() => setView('dashboard')}
                    />
                )}
            </main>
        </React.Fragment>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
