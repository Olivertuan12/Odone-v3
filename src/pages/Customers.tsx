import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Users, Mail, Phone, ExternalLink, TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const Customers = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      if (!user) return;
      try {
        const eventsSnapshot = await getDocs(query(collection(db, `users/${user.uid}/calendar_events`)));
        const events = eventsSnapshot.docs.map(d => d.data());
        
        // Group by email or name if email missing
        const customerMap = new Map();
        events.forEach(event => {
          const key = event.clientEmail || event.clientName;
          if (key) {
            const existing = customerMap.get(key) || {
              name: event.clientName || event.clientEmail || 'Unknown Identity',
              email: event.clientEmail || '',
              phone: event.clientPhone || '',
              orderCount: 0,
              totalProgress: 0,
              orders: []
            };
            existing.orderCount += 1;
            existing.totalProgress += (event.progress || 0);
            existing.orders.push(event);
            customerMap.set(key, existing);
          }
        });

        const customerList = Array.from(customerMap.values()).map(c => ({
          ...c,
          avgProgress: Math.round(c.totalProgress / c.orderCount)
        }));

        setCustomers(customerList);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'customers');
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers();
  }, [user]);

  const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];

  const chartData = customers
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5)
    .map(c => ({
      name: c.name,
      orders: c.orderCount
    }));

  if (loading) return <div className="p-8 text-white/40 uppercase font-bold text-[10px] animate-pulse whitespace-nowrap overflow-hidden">Loading Customer Nexus...</div>;

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#050505]">
       <header className="h-14 shrink-0 border-b border-white/10 flex items-center px-6 bg-[#050505]">
          <h1 className="text-xs font-bold uppercase tracking-[0.3em] text-[#E0E0E0]">Customer Intelligence</h1>
       </header>

       <div className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
             {/* Charts Section */}
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#121214] border border-white/5 rounded-lg p-6 flex flex-col h-64 shadow-2xl">
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                         <BarChart3 className="w-4 h-4 text-indigo-400" />
                         <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/80">Top Customers (Order Volume)</h3>
                      </div>
                      <TrendingUp className="w-4 h-4 text-emerald-400 opacity-50" />
                   </div>
                   <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis 
                               dataKey="name" 
                               axisLine={false} 
                               tickLine={false} 
                               tick={{ fill: '#ffffff40', fontSize: 9 }}
                            />
                            <YAxis 
                               axisLine={false} 
                               tickLine={false} 
                               tick={{ fill: '#ffffff40', fontSize: 9 }}
                            />
                            <Tooltip 
                               contentStyle={{ backgroundColor: '#1A1A1C', border: '1px solid #ffffff10', borderRadius: '4px', fontSize: '10px' }}
                            />
                            <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
                               {chartData.map((_entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                               ))}
                            </Bar>
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-[#121214] border border-white/5 rounded-lg p-6 flex flex-col h-64 shadow-2xl">
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                         <PieChart className="w-4 h-4 text-pink-400" />
                         <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/80">Growth Analytics</h3>
                      </div>
                      <span className="text-[9px] font-mono text-white/20 uppercase">Realtime data</span>
                   </div>
                   <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                      <div className="flex gap-8">
                         <div>
                            <div className="text-xl font-bold text-indigo-400 font-mono tracking-tighter">{customers.length}</div>
                            <div className="text-[8px] uppercase font-bold text-white/30 tracking-widest mt-1">Total Unique Clients</div>
                         </div>
                         <div className="w-px h-10 bg-white/5" />
                         <div>
                            <div className="text-xl font-bold text-pink-400 font-mono tracking-tighter">
                               {customers.reduce((acc, curr) => acc + curr.orderCount, 0)}
                            </div>
                            <div className="text-[8px] uppercase font-bold text-white/30 tracking-widest mt-1">Total Projects</div>
                         </div>
                      </div>
                      <div className="text-[9px] text-white/40 italic max-w-[200px]">
                         Analysis of client acquisition and retention based on synced calendar data.
                      </div>
                   </div>
                </div>
             </div>

             {/* Customer Table */}
             <div className="bg-[#121214] border border-white/5 rounded-lg overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-white/40" />
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/80">Customer Nexus</h3>
                   </div>
                   <div className="text-[9px] font-mono text-white/20 uppercase">{customers.length} Entries</div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead>
                         <tr className="bg-[#0D0D0E]">
                            <th className="px-6 py-3 text-[9px] uppercase font-bold text-white/30 tracking-wider">Client Identity</th>
                            <th className="px-6 py-3 text-[9px] uppercase font-bold text-white/30 tracking-wider">Contact Logic</th>
                            <th className="px-6 py-3 text-[9px] uppercase font-bold text-white/30 tracking-wider text-center">Projects</th>
                            <th className="px-6 py-3 text-[9px] uppercase font-bold text-white/30 tracking-wider">Average Completion</th>
                            <th className="px-6 py-3 text-[9px] uppercase font-bold text-white/30 tracking-wider text-right">Actions</th>
                         </tr>
                      </thead>
                      <tbody>
                         {customers.map((customer, idx) => (
                            <tr 
                              key={`${customer.email || customer.name}-${idx}`} 
                              className={`border-b border-white/5 hover:bg-white/2 transition-colors cursor-pointer group ${selectedCustomer?.email === customer.email ? 'bg-indigo-500/5 border-l-2 border-l-indigo-500' : ''}`}
                              onClick={() => setSelectedCustomer(customer)}
                            >
                               <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-white/60">{customer.name.charAt(0)}</span>
                                     </div>
                                     <div className="text-[11px] font-bold text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{customer.name}</div>
                                  </div>
                               </td>
                               <td className="px-6 py-4">
                                  <div className="flex flex-col gap-1">
                                     <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono tracking-tighter">
                                        <Mail className="w-3 h-3 text-indigo-500/50" /> {customer.email}
                                     </div>
                                     {customer.phone && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono tracking-tighter">
                                           <Phone className="w-3 h-3 text-indigo-500/50" /> {customer.phone}
                                        </div>
                                     )}
                                  </div>
                               </td>
                               <td className="px-6 py-4 text-center">
                                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px] font-bold font-mono">{customer.orderCount}</span>
                               </td>
                               <td className="px-6 py-4">
                                  <div className="w-32 space-y-1">
                                     <div className="flex justify-between text-[8px] font-mono text-white/20 uppercase">
                                        <span>Sync Rate</span>
                                        <span>{customer.avgProgress}%</span>
                                     </div>
                                     <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <div 
                                           className="h-full bg-indigo-500/50 transition-all duration-500"
                                           style={{ width: `${customer.avgProgress}%` }}
                                        />
                                     </div>
                                  </div>
                               </td>
                               <td className="px-6 py-4 text-right">
                                  <button className="p-2 text-white/20 hover:text-white transition-colors">
                                     <ExternalLink className="w-4 h-4" />
                                  </button>
                               </td>
                            </tr>
                         ))}
                         {customers.length === 0 && (
                            <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-[10px] text-white/20 uppercase italic tracking-widest font-mono">
                                  Initial syncing required. No unique client entities detected.
                               </td>
                            </tr>
                         )}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>

          {/* Right Detail Panel */}
          {selectedCustomer && (
             <div className="w-96 border-l border-white/10 bg-[#0A0A0B] flex flex-col shrink-0 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-6 border-b border-white/5 bg-[#0D0D0E]/50">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-600 to-pink-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                         <span className="text-lg font-black text-white">{selectedCustomer.name.charAt(0)}</span>
                      </div>
                      <div className="text-right">
                         <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-tighter">Loyalty Tier</div>
                         <div className="text-[11px] font-bold text-white uppercase tracking-widest">
                            {selectedCustomer.orderCount > 3 ? 'Elite Partner' : 'Emerging Client'}
                         </div>
                      </div>
                   </div>
                   <h2 className="text-lg font-bold text-white uppercase tracking-tight leading-none mb-1">{selectedCustomer.name}</h2>
                   <div className="text-[10px] text-white/30 font-mono tracking-tighter uppercase">{selectedCustomer.email}</div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                   <div className="space-y-4">
                      <h4 className="text-[9px] uppercase font-black text-white/20 tracking-[0.2em]">Project History</h4>
                      <div className="space-y-3">
                         {selectedCustomer.orders.map((order: any, idx: number) => (
                            <div key={idx} className="p-3 bg-white/5 border border-white/5 rounded-lg group hover:border-indigo-500/30 transition-all">
                               <div className="flex justify-between items-start mb-1">
                                  <div className="text-[10px] font-bold text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight truncate flex-1 pr-4">
                                     {order.title}
                                  </div>
                                  <span className="text-[8px] font-mono text-white/30 py-0.5 px-2 bg-black rounded shrink-0">
                                     {new Date(order.date).toLocaleDateString()}
                                  </span>
                               </div>
                               <div className="flex items-center justify-between">
                                  <div className="text-[9px] text-white/40 uppercase tracking-widest italic">{order.status || 'Active'}</div>
                                  <div className="text-[9px] font-mono text-indigo-400">{order.progress || 0}%</div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>

                   <div className="bg-white/2 border border-dashed border-white/10 rounded-lg p-4 text-center">
                      <div className="text-[9px] uppercase font-bold text-white/30 tracking-widest mb-1">Total Revenue Insight</div>
                      <div className="text-lg font-bold text-white font-mono">$ --,---</div>
                      <div className="text-[8px] text-white/20 text-center mt-2 italic px-4">Financial data integration pending external accounting sync.</div>
                   </div>
                </div>
                
                <div className="p-6 border-t border-white/5 bg-[#0D0D0E]/50">
                   <button className="w-full py-3 bg-white hover:bg-white/90 text-black text-[10px] uppercase font-black tracking-widest rounded transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                      Internal Communications Port
                   </button>
                </div>
             </div>
          )}
       </div>
    </div>
  );
};
