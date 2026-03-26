import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getChildren, addChild, updateChild, deleteChild,
  getTaskTemplates, addTaskTemplate, updateTaskTemplate, deleteTaskTemplate,
  getStoreItems, addStoreItem, updateStoreItem, deleteStoreItem,
  buildTaskTree
} from '../database';

import { AVATAR_CATEGORIES } from '../data/avatars';
const AVATAR_COLORS = ['#e0115f', '#50c878', '#0f52ba', '#9b59b6', '#ffbf00', '#ff6b35', '#00d4aa', '#ff69b4'];
const STORE_EMOJIS = ['🍦', '🎮', '🧸', '🎬', '⭐', '🌙', '🍕', '🎨', '📚', '🎪', '🎁', '🎵', '🏊', '🚴', '🎯'];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { signOut, user, isConfigured } = useAuth();
  const [section, setSection] = useState(null); // null = menu, 'children' | 'daily' | 'weekly' | 'store'

  if (section === 'children') return <ChildrenManager onBack={() => setSection(null)} />;
  if (section === 'daily') return <TaskManager type="daily" onBack={() => setSection(null)} />;
  if (section === 'weekly') return <TaskManager type="weekly" onBack={() => setSection(null)} />;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gold flex items-center gap-2">⚙️ More</h2>

      <div className="space-y-2">
        {/* History link */}
        <button
          onClick={() => navigate('/history')}
          className="dragon-card w-full text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <span className="text-2xl">📜</span>
          <div className="flex-1">
            <p className="font-semibold text-white text-sm">Gem History</p>
            <p className="text-[10px] text-gray-500">All gem transactions & ledger</p>
          </div>
          <span className="text-gray-600">›</span>
        </button>

        {[
          { key: 'children', icon: '👧', label: 'Manage Children', desc: 'Add, edit, remove kids' },
          { key: 'daily', icon: '📋', label: 'Daily Tasks', desc: 'Set up daily routine tasks' },
          { key: 'weekly', icon: '📅', label: 'Weekly Tasks', desc: 'Set up weekly / occasional tasks' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setSection(item.key)}
            className="dragon-card w-full text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{item.label}</p>
              <p className="text-[10px] text-gray-500">{item.desc}</p>
            </div>
            <span className="text-gray-600">›</span>
          </button>
        ))}
      </div>

      {/* Auth Info */}
      {isConfigured && user && (
        <div className="dragon-card space-y-3 mt-6">
          <p className="text-xs text-gray-400">Signed in as</p>
          <p className="text-sm text-white">{user.email}</p>
          <button onClick={signOut} className="btn-outline w-full text-center text-sm">Sign Out</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════
// Children Manager
// ════════════════════════════════════
function ChildrenManager({ onBack }) {
  const { loadChildren, showToast } = useApp();
  const [children, setChildren] = useState([]);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🐉');
  const [color, setColor] = useState('#9b59b6');

  const load = useCallback(async () => {
    const kids = await getChildren();
    setChildren(kids);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editId) {
        await updateChild(editId, { name: name.trim(), avatar_emoji: emoji, avatar_color: color });
        showToast('Child updated!', 'success');
      } else {
        await addChild(name.trim(), color, emoji);
        showToast('Child added!', 'success');
      }
      setName(''); setEmoji('🐉'); setColor('#9b59b6'); setEditId(null);
      await load();
      await loadChildren();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (child) => {
    setEditId(child.id);
    setName(child.name);
    setEmoji(child.avatar_emoji || '🐉');
    setColor(child.avatar_color || '#9b59b6');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this child and all their data?')) return;
    await deleteChild(id);
    await load();
    await loadChildren();
    showToast('Child removed', 'info');
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">👧 Manage Children</h2>

      {/* Form */}
      <div className="dragon-card space-y-3">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Child's name"
          className="w-full"
        />
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Avatar</label>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-cave-800/30 p-2 space-y-2">
            {AVATAR_CATEGORIES.map(cat => (
              <div key={cat.name}>
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">{cat.name}</p>
                <div className="flex gap-1 flex-wrap">
                  {cat.emojis.map(e => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all
                        ${emoji === e ? 'bg-gold/20 border-2 border-gold/50 scale-110' : 'bg-cave-700/50 border border-cave-600/20 hover:border-cave-500'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Color</label>
          <div className="flex gap-1.5">
            {AVATAR_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-gold scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <button onClick={handleSave} className="btn-gold w-full text-center" disabled={!name.trim()}>
          {editId ? 'Update' : 'Add Child'}
        </button>
        {editId && (
          <button onClick={() => { setEditId(null); setName(''); }} className="btn-outline w-full text-center text-sm">
            Cancel
          </button>
        )}
      </div>

      {/* List */}
      {children.map(child => (
        <div key={child.id} className="dragon-card flex items-center gap-3">
          <span className="text-2xl">{child.avatar_emoji}</span>
          <span className="flex-1 font-semibold text-white">{child.name}</span>
          <button onClick={() => handleEdit(child)} className="text-xs text-gold/60 hover:text-gold px-2 py-1">Edit</button>
          <button onClick={() => handleDelete(child.id)} className="text-xs text-gem-ruby/60 hover:text-gem-ruby px-2 py-1">Delete</button>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════
// Task Template Manager
// ════════════════════════════════════
function TaskManager({ type, onBack }) {
  const { children: kids, showToast } = useApp();
  const [selectedKid, setSelectedKid] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState(null);
  const [gemValue, setGemValue] = useState(1);
  const [bonusGems, setBonusGems] = useState(0);

  useEffect(() => {
    if (kids.length > 0 && !selectedKid) setSelectedKid(kids[0]);
  }, [kids, selectedKid]);

  const load = useCallback(async () => {
    if (!selectedKid) return;
    const t = await getTaskTemplates(selectedKid.id, type);
    setTemplates(t);
  }, [selectedKid, type]);

  useEffect(() => { load(); }, [load]);

  const tree = buildTaskTree(templates);

  const handleSave = async () => {
    if (!title.trim() || !selectedKid) return;
    try {
      const data = {
        child_id: selectedKid.id,
        title: title.trim(),
        task_type: type,
        parent_id: parentId || null,
        gem_value: parentId ? gemValue : 0,  // Main tasks don't have gem_value, only subtasks
        bonus_gems: parentId ? 0 : bonusGems,  // Only main tasks have bonus
        sort_order: templates.length,
      };
      if (editId) {
        await updateTaskTemplate(editId, { title: data.title, gem_value: data.gem_value, bonus_gems: data.bonus_gems });
      } else {
        await addTaskTemplate(data);
      }
      showToast(editId ? 'Task updated!' : 'Task added!', 'success');
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    await deleteTaskTemplate(id);
    await load();
    showToast('Task removed', 'info');
  };

  const resetForm = () => {
    setShowForm(false); setEditId(null); setTitle(''); setParentId(null); setGemValue(1); setBonusGems(0);
  };

  const startAddSubtask = (mainTaskId) => {
    setParentId(mainTaskId);
    setShowForm(true);
    setEditId(null);
    setTitle('');
    setGemValue(1);
  };

  const startAddMain = () => {
    setParentId(null);
    setShowForm(true);
    setEditId(null);
    setTitle('');
    setBonusGems(2);
  };

  const label = type === 'daily' ? 'Daily' : 'Weekly';

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">{type === 'daily' ? '📋' : '📅'} {label} Tasks</h2>

      {/* Child selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {kids.map(kid => (
          <button
            key={kid.id}
            onClick={() => setSelectedKid(kid)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all
              ${selectedKid?.id === kid.id
                ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
          >
            {kid.avatar_emoji} {kid.name}
          </button>
        ))}
      </div>

      {/* Task Tree Display */}
      {tree.length === 0 && !showForm ? (
        <div className="dragon-card text-center py-8">
          <p className="text-4xl mb-3">{type === 'daily' ? '📋' : '📅'}</p>
          <p className="text-gray-400 mb-3">No {label.toLowerCase()} tasks yet</p>
          <button onClick={startAddMain} className="btn-gold">+ Add Main Task</button>
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map(main => (
            <div key={main.id} className="dragon-card">
              <div className="flex items-center gap-2">
                <span className="text-gold font-semibold text-sm flex-1">{main.title}</span>
                {main.bonus_gems > 0 && (
                  <span className="text-[10px] bg-gold/10 text-gold/70 px-2 py-0.5 rounded-full">+{main.bonus_gems} bonus</span>
                )}
                <button onClick={() => handleDelete(main.id)} className="text-[10px] text-gem-ruby/50 hover:text-gem-ruby px-1">✕</button>
              </div>

              {/* Subtasks */}
              <div className="mt-2 ml-4 space-y-1">
                {main.subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 text-sm text-gray-300 py-1">
                    <span className="text-cave-600 text-xs">├</span>
                    <span className="flex-1">{sub.title}</span>
                    <span className="text-xs text-gray-500">💎{sub.gem_value}</span>
                    <button onClick={() => handleDelete(sub.id)} className="text-[10px] text-gem-ruby/40 hover:text-gem-ruby px-1">✕</button>
                  </div>
                ))}
                <button
                  onClick={() => startAddSubtask(main.id)}
                  className="text-xs text-gold/50 hover:text-gold py-1 pl-4"
                >
                  + Add subtask
                </button>
              </div>
            </div>
          ))}
          <button onClick={startAddMain} className="btn-outline w-full text-center text-sm">
            + Add Main Task
          </button>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="dragon-card space-y-3 border-gold/30">
          <h3 className="text-sm font-semibold text-gold">
            {parentId ? 'Add Subtask' : `Add Main ${label} Task`}
          </h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={parentId ? 'Subtask name (e.g., Brush teeth)' : 'Main task name (e.g., Morning Routine)'}
            autoFocus
          />
          {parentId ? (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Gems per completion</label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setGemValue(n)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                      ${gemValue === n ? 'bg-gold/20 border-2 border-gold/50 text-gold' : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                  >
                    💎{n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Bonus gems (when all subtasks done)</label>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setBonusGems(n)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                      ${bonusGems === n ? 'bg-gold/20 border-2 border-gold/50 text-gold' : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                  >
                    {n === 0 ? 'None' : `💎${n}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={resetForm} className="btn-outline flex-1 text-center">Cancel</button>
            <button onClick={handleSave} className="btn-gold flex-1 text-center" disabled={!title.trim()}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════
// Store Item Manager
// ════════════════════════════════════
function StoreManager({ onBack }) {
  const { showToast } = useApp();
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [cost, setCost] = useState(10);
  const [emoji, setEmoji] = useState('🎁');
  const [description, setDescription] = useState('');
  const [editId, setEditId] = useState(null);

  const load = useCallback(async () => {
    const data = await getStoreItems();
    setItems(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editId) {
        await updateStoreItem(editId, { name: name.trim(), gem_cost: cost, emoji, description: description.trim() });
      } else {
        await addStoreItem({ name: name.trim(), gem_cost: cost, emoji, description: description.trim() });
      }
      showToast(editId ? 'Item updated!' : 'Item added!', 'success');
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    await deleteStoreItem(id);
    await load();
    showToast('Item removed', 'info');
  };

  const resetForm = () => {
    setShowForm(false); setEditId(null); setName(''); setCost(10); setEmoji('🎁'); setDescription('');
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">🏪 Store Items</h2>

      {/* Items List */}
      {items.length === 0 && !showForm ? (
        <div className="dragon-card text-center py-8">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-gray-400 mb-3">No store items yet</p>
          <button onClick={() => setShowForm(true)} className="btn-gold">+ Add Reward</button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="dragon-card flex items-center gap-3">
              <span className="text-2xl">{item.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                {item.description && <p className="text-[10px] text-gray-500">{item.description}</p>}
              </div>
              <span className="gem-counter text-xs">💎{item.gem_cost}</span>
              <button onClick={() => handleDelete(item.id)} className="text-xs text-gem-ruby/50 hover:text-gem-ruby px-1">✕</button>
            </div>
          ))}
          <button onClick={() => setShowForm(true)} className="btn-outline w-full text-center text-sm">
            + Add Reward
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="dragon-card space-y-3 border-gold/30">
          <h3 className="text-sm font-semibold text-gold">Add Store Item</h3>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Reward name" autoFocus />
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Gem Cost</label>
            <input type="number" value={cost} onChange={e => setCost(parseInt(e.target.value) || 0)} min={1} className="w-24" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Emoji</label>
            <div className="flex gap-1.5 flex-wrap">
              {STORE_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all
                    ${emoji === e ? 'bg-gold/20 border-2 border-gold/50 scale-110' : 'bg-cave-700/50 border border-cave-600/30'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={resetForm} className="btn-outline flex-1 text-center">Cancel</button>
            <button onClick={handleSave} className="btn-gold flex-1 text-center" disabled={!name.trim()}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
