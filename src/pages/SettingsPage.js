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
import { DRAGON_CATEGORIES, DINO_CATEGORIES, ALL_DRAGONS, ALL_DINOS, isDragonAvatar, getDragonSrc } from '../data/dragonAvatars';
import ChildAvatar from '../components/shared/ChildAvatar';
const AVATAR_COLORS = ['#e0115f', '#50c878', '#0f52ba', '#9b59b6', '#ffbf00', '#ff6b35', '#00d4aa', '#ff69b4'];
const STORE_EMOJIS = ['🍦', '🎮', '🧸', '🎬', '⭐', '🌙', '🍕', '🎨', '📚', '🎪', '🎁', '🎵', '🏊', '🚴', '🎯'];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { signOut, user, isConfigured } = useAuth();
  const [section, setSection] = useState(null); // null = menu, 'children' | 'daily' | 'weekly' | 'store'

  if (section === 'children') return <ChildrenManager onBack={() => setSection(null)} />;
  if (section === 'daily') return <TaskManager type="daily" onBack={() => setSection(null)} />;
  if (section === 'weekly') return <TaskManager type="weekly" onBack={() => setSection(null)} />;
  if (section === 'data') return <DataManager onBack={() => setSection(null)} />;
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
          { key: 'data', icon: '💾', label: 'Backup & Restore', desc: 'Export or import all data' },
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

      {/* Text Size */}
      <TextSizePicker />

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

  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">👧 Manage Children</h2>

      {/* List first */}
      {children.map(child => (
        <div key={child.id} className="dragon-card flex items-center gap-3">
          <ChildAvatar emoji={child.avatar_emoji} size="lg" />
          <span className="flex-1 font-semibold text-white">{child.name}</span>
          <button onClick={() => { handleEdit(child); setShowForm(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-gold/15 text-gold font-semibold">Edit</button>
          <button onClick={() => handleDelete(child.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-bold">✕</button>
        </div>
      ))}

      {/* Add button */}
      {!showForm && !editId && (
        <button
          onClick={() => { setShowForm(true); setName(''); setEmoji('🐉'); setColor('#9b59b6'); }}
          className="dragon-card w-full flex items-center justify-center gap-2 py-4 cursor-pointer border-gold/30 hover:border-gold/50 active:scale-[0.98] transition-all"
        >
          <span className="text-2xl text-gold">＋</span>
          <span className="text-gold font-semibold">Add Child</span>
        </button>
      )}

      {/* Form — only visible when adding or editing */}
      {(showForm || editId) && (
      <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
        <h3 className="text-sm font-semibold text-gold">{editId ? 'Edit Child' : 'Add Child'}</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Child's name"
          className="w-full"
          autoFocus
        />
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Avatar</label>
          {/* Selected avatar preview */}
          {isDragonAvatar(emoji) && (
            <div className="flex items-center gap-3 mb-2 p-2 rounded-xl bg-cave-800/50">
              <img src={getDragonSrc(emoji)} alt="Selected" className="w-16 h-16 rounded-xl object-cover border-2 border-gold/40" />
              <div>
                <p className="text-sm font-semibold text-gold">
                  {[...ALL_DRAGONS, ...ALL_DINOS].find(d => d.id === emoji)?.name || emoji}
                </p>
                <p className="text-[10px] text-gray-500">Selected avatar</p>
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-xl bg-cave-800/30 p-2 space-y-2">
            {/* Dragon avatars */}
            {DRAGON_CATEGORIES.map(cat => (
              <div key={cat.name}>
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">{cat.name}</p>
                <div className="flex gap-1 flex-wrap">
                  {cat.avatars.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setEmoji(d.id)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all overflow-hidden
                        ${emoji === d.id ? 'ring-2 ring-gold scale-110' : 'bg-cave-700/50 border border-cave-600/20 hover:border-cave-500'}`}
                      title={d.name}
                    >
                      <img src={getDragonSrc(d.id)} alt={d.name} className="w-full h-full object-cover rounded-lg" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {/* Dinosaur avatars */}
            {DINO_CATEGORIES.map(cat => (
              <div key={cat.name}>
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">{cat.name}</p>
                <div className="flex gap-1 flex-wrap">
                  {cat.avatars.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setEmoji(d.id)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all overflow-hidden
                        ${emoji === d.id ? 'ring-2 ring-gold scale-110' : 'bg-cave-700/50 border border-cave-600/20 hover:border-cave-500'}`}
                      title={d.name}
                    >
                      <img src={getDragonSrc(d.id)} alt={d.name} className="w-full h-full object-cover rounded-lg" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {/* Emoji avatars */}
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
        <div className="flex gap-3">
          <button onClick={() => { setShowForm(false); setEditId(null); setName(''); }} className="btn-outline flex-1 text-center">Cancel</button>
          <button onClick={() => { handleSave(); setShowForm(false); }} className="btn-gold flex-1 text-center" disabled={!name.trim()}>
            {editId ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

// ════════════════════════════════════
// Task Template Manager
// ════════════════════════════════════
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_SHORT  = ['S','M','T','W','T','F','S'];
const GEM_FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function gemLbl(v) { return GEM_FRACTIONS[v] || String(v); }

function TaskManager({ type, onBack }) {
  const { children: kids, showToast } = useApp();
  const [selectedKid, setSelectedKid] = useState('all'); // 'all' | kid object
  const [allTemplates, setAllTemplates] = useState([]); // templates tagged with child info
  const [filterDay, setFilterDay] = useState('all'); // 'all' | 0-6
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editChildId, setEditChildId] = useState(null); // which child owns the task being edited
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState(null);
  const [gemValue, setGemValue] = useState(1);
  const [bonusGems, setBonusGems] = useState(0);
  const [activeDays, setActiveDays] = useState(null); // null = every day

  const isAllView = selectedKid === 'all';
  const kidMap = {};
  kids.forEach(k => { kidMap[k.id] = k; });

  const load = useCallback(async () => {
    if (isAllView) {
      // Load templates for ALL children — spread to avoid mutating DB objects
      const all = [];
      for (const kid of kids) {
        const t = await getTaskTemplates(kid.id, type);
        all.push(...t.map(tmpl => ({ ...tmpl, _childId: kid.id })));
      }
      setAllTemplates(all);
    } else if (selectedKid) {
      const t = await getTaskTemplates(selectedKid.id, type);
      setAllTemplates(t.map(tmpl => ({ ...tmpl, _childId: selectedKid.id })));
    }
  }, [selectedKid, isAllView, kids, type]);

  useEffect(() => { load(); }, [load]);

  // Group templates by child, build trees, then flatten with child tags
  const groupedTrees = {};
  if (isAllView) {
    kids.forEach(kid => {
      const kidTemplates = allTemplates.filter(t => t._childId === kid.id);
      groupedTrees[kid.id] = buildTaskTree(kidTemplates);
    });
  } else if (selectedKid) {
    groupedTrees[selectedKid.id] = buildTaskTree(allTemplates);
  }

  // Flatten into a single list with child info attached
  let tree = [];
  Object.entries(groupedTrees).forEach(([childId, tasks]) => {
    tasks.forEach(main => {
      main._childId = childId;
      tree.push(main);
    });
  });

  // Apply day filter
  const allTree = tree;
  if (filterDay !== 'all') {
    tree = tree.filter(main => {
      if (!main.active_days || main.active_days.length === 0 || main.active_days.length === 7) return true;
      return main.active_days.includes(filterDay);
    });
  }

  const handleSave = async () => {
    const saveKid = isAllView ? kidMap[editChildId] : selectedKid;
    if (!title.trim() || !saveKid) return;
    try {
      const data = {
        child_id: saveKid.id,
        title: title.trim(),
        task_type: type,
        parent_id: parentId || null,
        gem_value: parentId ? gemValue : 0,
        bonus_gems: parentId ? 0 : bonusGems,
        sort_order: allTemplates.length,
      };
      if (!parentId) data.active_days = activeDays;
      if (editId) {
        const updates = { title: data.title, gem_value: data.gem_value, bonus_gems: data.bonus_gems };
        if (!parentId) updates.active_days = activeDays;
        await updateTaskTemplate(editId, updates);
      } else {
        // Strip internal props before saving to DB
        const { _childId, ...cleanData } = data;
        await addTaskTemplate(cleanData);
      }
      showToast(editId ? 'Task updated!' : 'Task added!', 'success');
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    await deleteTaskTemplate(id);
    await load();
    showToast('Task removed', 'info');
  };

  const resetForm = () => {
    setShowForm(false); setEditId(null); setEditChildId(null); setTitle(''); setParentId(null); setGemValue(1); setBonusGems(0); setActiveDays(null);
  };

  const startAddSubtask = (mainTaskId, childId) => {
    setParentId(mainTaskId); setEditChildId(childId); setShowForm(true); setEditId(null); setTitle(''); setGemValue(1);
  };

  const startAddMain = () => {
    if (isAllView) return; // must select a child first
    setParentId(null); setEditChildId(selectedKid.id); setShowForm(true); setEditId(null); setTitle(''); setBonusGems(2); setActiveDays(null);
  };

  const startEditMain = (main) => {
    setEditId(main.id); setEditChildId(main._childId); setTitle(main.title); setParentId(null);
    setBonusGems(main.bonus_gems || 0); setActiveDays(main.active_days || null); setShowForm(true);
  };

  const startEditSub = (sub, mainId, childId) => {
    setEditId(sub.id); setEditChildId(childId); setTitle(sub.title); setParentId(mainId);
    setGemValue(sub.gem_value || 1); setShowForm(true);
  };

  const label = type === 'daily' ? 'Daily' : 'Weekly';
  const todayIdx = new Date().getDay();

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">{type === 'daily' ? '📋' : '📅'} {label} Tasks</h2>

      {/* Child selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {kids.length > 1 && (
          <button
            onClick={() => setSelectedKid('all')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all
              ${isAllView
                ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
          >
            All
          </button>
        )}
        {kids.map(kid => (
          <button
            key={kid.id}
            onClick={() => setSelectedKid(kid)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all
              ${!isAllView && selectedKid?.id === kid.id
                ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
          >
            <ChildAvatar emoji={kid.avatar_emoji} size="xs" /> {kid.name}
          </button>
        ))}
      </div>

      {/* Day filter bar */}
      {type === 'daily' && (
        <div className="flex gap-1">
          <button
            onClick={() => setFilterDay('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
              ${filterDay === 'all'
                ? 'bg-gold/20 border border-gold/50 text-gold'
                : 'bg-cave-700/50 border border-cave-600/30 text-gray-500'}`}
          >
            All
          </button>
          {DAY_LABELS.map((day, i) => (
            <button
              key={day}
              onClick={() => setFilterDay(i)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all
                ${filterDay === i
                  ? 'bg-gold/20 border border-gold/50 text-gold'
                  : i === todayIdx
                  ? 'bg-cave-600/40 border border-cave-500/40 text-gray-300'
                  : 'bg-cave-700/50 border border-cave-600/30 text-gray-500'}`}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {/* Task count summary */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-500">
          {tree.length} task group{tree.length !== 1 ? 's' : ''}
          {filterDay !== 'all' ? ` on ${DAY_LABELS[filterDay]}` : ''}
          {allTree.length !== tree.length ? ` (${allTree.length} total)` : ''}
        </p>
      </div>

      {/* Task Tree */}
      {tree.length === 0 && !showForm ? (
        <div className="dragon-card text-center py-8">
          <p className="text-4xl mb-3">{type === 'daily' ? '📋' : '📅'}</p>
          <p className="text-gray-400 mb-3">
            {filterDay !== 'all'
              ? `No tasks on ${DAY_LABELS[filterDay]}s`
              : `No ${label.toLowerCase()} tasks yet`}
          </p>
          {!isAllView && <button onClick={startAddMain} className="btn-gold">+ Add Main Task</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map(main => {
            const dayTags = main.active_days && main.active_days.length < 7
              ? main.active_days.map(d => DAY_SHORT[d]).join(' ')
              : null;

            return (
              <div key={`${main._childId}-${main.id}`} className="dragon-card animate-fade-in">
                {/* Main task header */}
                <div className="flex items-center gap-2">
                  {isAllView && kidMap[main._childId] && (
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cave-700/60 flex items-center justify-center ring-1 ring-cave-500/30" title={kidMap[main._childId].name}>
                      <ChildAvatar emoji={kidMap[main._childId].avatar_emoji} size="xs" />
                    </span>
                  )}
                  <button onClick={() => startEditMain(main)} className="flex-1 text-left active:scale-[0.98] group">
                    <span className="text-gold font-semibold text-sm">{main.title}</span>
                    <span className="text-[9px] text-gray-600 ml-1.5 opacity-0 group-active:opacity-100">✏️</span>
                  </button>
                  {dayTags && (
                    <span className="text-[9px] text-gray-500 bg-cave-700/50 px-1.5 py-0.5 rounded">
                      {dayTags}
                    </span>
                  )}
                  {main.bonus_gems > 0 && (
                    <span className="text-[10px] bg-gold/10 text-gold/70 px-2 py-0.5 rounded-full">+{main.bonus_gems} bonus</span>
                  )}
                  <button onClick={() => handleDelete(main.id)} className="text-[10px] text-gem-ruby/30 hover:text-gem-ruby px-1">✕</button>
                </div>

                {/* Subtasks */}
                <div className="mt-2 ml-3 space-y-0.5">
                  {main.subtasks.map((sub, si) => (
                    <div key={sub.id} className="flex items-center gap-2 text-sm text-gray-300 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <span className="text-cave-600 text-xs w-3">
                        {si === main.subtasks.length - 1 ? '└' : '├'}
                      </span>
                      <button onClick={() => startEditSub(sub, main.id, main._childId)} className="flex-1 text-left active:scale-[0.98]">
                        {sub.title}
                      </button>
                      <span className="text-xs text-gray-500 font-medium">💎{gemLbl(sub.gem_value)}</span>
                      <button onClick={() => handleDelete(sub.id)} className="text-[10px] text-gem-ruby/30 hover:text-gem-ruby px-1">✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => startAddSubtask(main.id, main._childId)}
                    className="text-xs text-gold/40 hover:text-gold/70 py-1 pl-5 transition-colors"
                  >
                    + Add subtask
                  </button>
                </div>
              </div>
            );
          })}
          {!isAllView && (
            <button onClick={startAddMain} className="btn-outline w-full text-center text-sm">
              + Add Main Task
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
          <h3 className="text-sm font-semibold text-gold">
            {editId
              ? (parentId ? 'Edit Subtask' : 'Edit Main Task')
              : (parentId ? 'Add Subtask' : `Add Main ${label} Task`)}
            {isAllView && editChildId && kidMap[editChildId] && (
              <span className="text-gray-400 font-normal ml-2">
                — <ChildAvatar emoji={kidMap[editChildId].avatar_emoji} size="xs" /> {kidMap[editChildId].name}
              </span>
            )}
          </h3>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={parentId ? 'Subtask name (e.g., Brush teeth)' : 'Main task name (e.g., Morning Routine)'}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          {parentId ? (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Gems per completion</label>
              <div className="flex gap-1.5">
                {[0.25, 0.5, 1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setGemValue(n)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                      ${gemValue === n ? 'bg-gold/20 border-2 border-gold/50 text-gold' : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                  >
                    {gemLbl(n)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Bonus gems (when all subtasks done)</label>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setBonusGems(n)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all
                        ${bonusGems === n ? 'bg-gold/20 border-2 border-gold/50 text-gold' : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
                    >
                      {n === 0 ? '—' : `💎${n}`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Active days</label>
                <div className="flex gap-1">
                  {DAY_LABELS.map((day, i) => {
                    const days = activeDays || [0,1,2,3,4,5,6];
                    const isActive = days.includes(i);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          const newDays = isActive ? days.filter(d => d !== i) : [...days, i].sort();
                          setActiveDays(newDays.length === 7 ? null : newDays.length === 0 ? null : newDays);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all
                          ${isActive
                            ? 'bg-gold/20 border border-gold/50 text-gold'
                            : 'bg-cave-700/50 border border-cave-600/30 text-gray-600'}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-gray-600 mt-1">Tap to toggle. All selected = every day.</p>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={resetForm} className="btn-outline flex-1 text-center">Cancel</button>
            <button onClick={handleSave} className="btn-gold flex-1 text-center" disabled={!title.trim()}>
              {editId ? 'Save' : 'Add'}
            </button>
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
          {!showForm && (
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="dragon-card w-full flex items-center justify-center gap-2 py-4 cursor-pointer border-gold/30 hover:border-gold/50 active:scale-[0.98] transition-all">
              <span className="text-2xl text-gold">＋</span>
              <span className="text-gold font-semibold">Add Reward</span>
            </button>
          )}
          {items.map(item => (
            <div key={item.id} className="dragon-card flex items-center gap-3">
              <span className="text-2xl">{item.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                {item.description && <p className="text-[10px] text-gray-500">{item.description}</p>}
              </div>
              <span className="gem-counter text-xs">💎{item.gem_cost}</span>
              <button onClick={() => { setEditId(item.id); setName(item.name); setCost(item.gem_cost); setEmoji(item.emoji || '🎁'); setDescription(item.description || ''); setShowForm(true); }}
                className="text-xs px-2 py-1 rounded-lg bg-gold/10 text-gold/60 hover:text-gold">✏️</button>
              <button onClick={() => handleDelete(item.id)} className="text-xs text-gem-ruby/50 hover:text-gem-ruby px-1">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="dragon-card space-y-3 border-gold/30">
          <h3 className="text-sm font-semibold text-gold">{editId ? 'Edit Store Item' : 'Add Store Item'}</h3>
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

// ════════════════════════════════════
// Data Export / Import
// ════════════════════════════════════
function DataManager({ onBack }) {
  const { loadChildren, showToast } = useApp();
  const [importPreview, setImportPreview] = useState(null); // { data, keyCount, childNames }
  const fileInputRef = React.useRef(null);

  const PREFIX = 'dgc_';

  const getAllData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) {
        try { data[key] = JSON.parse(localStorage.getItem(key)); }
        catch { data[key] = localStorage.getItem(key); }
      }
    }
    return data;
  };

  const handleExport = () => {
    const data = getAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `dragon-gems-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded!', 'success');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const keys = Object.keys(data).filter(k => k.startsWith(PREFIX));
        if (keys.length === 0) {
          showToast('Invalid backup file — no Dragon Gems data found', 'error');
          return;
        }
        // Extract child names for preview
        const children = data[PREFIX + 'children'] || [];
        const childNames = Array.isArray(children) ? children.map(c => `${c.avatar_emoji || '🐉'} ${c.name}`) : [];
        setImportPreview({ data, keyCount: keys.length, childNames });
      } catch {
        showToast('Could not read file — invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    // Reset so same file can be selected again
    e.target.value = '';
  };

  const handleImport = () => {
    if (!importPreview) return;
    const { data } = importPreview;

    // Clear existing dgc_ data
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));

    // Write imported data
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(PREFIX)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }

    setImportPreview(null);
    loadChildren();
    showToast('Data restored! Reloading...', 'success');
    setTimeout(() => window.location.reload(), 1000);
  };

  const currentData = getAllData();
  const currentKeys = Object.keys(currentData).length;
  const currentChildren = currentData[PREFIX + 'children'] || [];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gold/70 hover:text-gold">← Back</button>
      <h2 className="text-lg font-bold text-gold">💾 Backup & Restore</h2>

      {/* Current data summary */}
      <div className="dragon-card space-y-2">
        <p className="text-xs text-gray-400">Current data</p>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{currentKeys} records</p>
            <p className="text-[10px] text-gray-500">
              {Array.isArray(currentChildren) && currentChildren.length > 0
                ? currentChildren.map(c => `${c.avatar_emoji || '🐉'} ${c.name}`).join(', ')
                : 'No children'}
            </p>
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="dragon-card space-y-3">
        <div>
          <p className="text-sm font-semibold text-white">Export Backup</p>
          <p className="text-[10px] text-gray-500">Download all data as a JSON file</p>
        </div>
        <button onClick={handleExport} className="btn-gold w-full text-center">
          📥 Download Backup
        </button>
      </div>

      {/* Import */}
      <div className="dragon-card space-y-3">
        <div>
          <p className="text-sm font-semibold text-white">Restore from Backup</p>
          <p className="text-[10px] text-gray-500">Load a previously exported JSON file — this replaces all current data</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-outline w-full text-center"
        >
          📂 Choose Backup File
        </button>
      </div>

      {/* Import Preview / Confirm */}
      {importPreview && (
        <div className="dragon-card space-y-3 border-gold/30 animate-slide-up">
          <h3 className="text-sm font-semibold text-gold">Confirm Restore</h3>
          <div className="bg-cave-800/50 rounded-xl p-3 space-y-1">
            <p className="text-sm text-white">{importPreview.keyCount} records found</p>
            {importPreview.childNames.length > 0 && (
              <p className="text-xs text-gray-400">Children: {importPreview.childNames.join(', ')}</p>
            )}
          </div>
          <p className="text-xs text-gem-ruby/80">This will replace all current data. Make sure you've exported a backup first!</p>
          <div className="flex gap-3">
            <button onClick={() => setImportPreview(null)} className="btn-outline flex-1 text-center">Cancel</button>
            <button onClick={handleImport} className="flex-1 py-2 rounded-xl text-sm font-bold bg-gem-ruby/20 border-2 border-gem-ruby/50 text-gem-ruby active:scale-95 transition-all text-center">
              Replace & Restore
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════
// Text Size Picker (device-aware)
// ════════════════════════════════════
const TEXT_SIZES = [
  { key: 'normal', label: 'Normal', phonePx: 16, tabletPx: 16 },
  { key: 'medium', label: 'Medium', phonePx: 18, tabletPx: 18 },
  { key: 'large', label: 'Large', phonePx: 20, tabletPx: 20 },
  { key: 'xl', label: 'XL', phonePx: 22, tabletPx: 22 },
];

function applyTextSize(sizeKey) {
  const isTablet = window.innerWidth >= 768;
  const size = TEXT_SIZES.find(s => s.key === sizeKey) || TEXT_SIZES[0];
  const px = isTablet ? size.tabletPx : size.phonePx;
  document.documentElement.style.fontSize = `${px}px`;
  localStorage.setItem('dgc_textSize', sizeKey);
}

// Apply saved size on load
(function initTextSize() {
  const saved = localStorage.getItem('dgc_textSize');
  if (saved) applyTextSize(saved);
})();

// Re-apply on resize (phone/tablet orientation change)
window.addEventListener('resize', () => {
  const saved = localStorage.getItem('dgc_textSize');
  if (saved) applyTextSize(saved);
});

function TextSizePicker() {
  const [current, setCurrent] = useState(localStorage.getItem('dgc_textSize') || 'normal');

  const handleChange = (sizeKey) => {
    setCurrent(sizeKey);
    applyTextSize(sizeKey);
  };

  return (
    <div className="dragon-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">Text Size</p>
          <p className="text-[10px] text-gray-500">Scales the entire app</p>
        </div>
        <span className="text-2xl">🔤</span>
      </div>
      <div className="flex gap-2">
        {TEXT_SIZES.map(size => (
          <button
            key={size.key}
            onClick={() => handleChange(size.key)}
            className={`flex-1 py-2 rounded-xl font-bold transition-all
              ${current === size.key
                ? 'bg-gold/20 border-2 border-gold/50 text-gold'
                : 'bg-cave-700/50 border-2 border-cave-600/30 text-gray-400'}`}
            style={{ fontSize: size.key === 'normal' ? 11 : size.key === 'medium' ? 12 : size.key === 'large' ? 13 : 15 }}
          >
            {size.label}
          </button>
        ))}
      </div>
    </div>
  );
}
