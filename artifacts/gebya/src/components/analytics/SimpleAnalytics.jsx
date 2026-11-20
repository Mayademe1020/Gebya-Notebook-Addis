/**
 * Simple Analytics Dashboard
 * 
 * Displays basic usage metrics and event counts from local IndexedDB.
 * No external analytics services - privacy-first approach.
 */

import { useEffect, useState } from 'react';
import db from '../../db';
import { useLang } from '../../context/LangContext';
import { ArrowLeft, TrendingUp, Users, Activity, Calendar } from 'lucide-react';
import { label } from '../../labels/index.js';

export default function SimpleAnalytics({ onClose }) {
  const { lang } = useLang();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const events = await db.analytics
          .where('key')
          .startsWith('event:')
          .toArray();

        // Group by event type
        const grouped = {};
        for (const event of events) {
          const eventType = event.key.replace('event:', '');
          const eventData = JSON.parse(event.value || '{}');
          
          if (!grouped[eventType]) {
            grouped[eventType] = {
              count: 0,
              lastSeen: 0
            };
          }
          
          grouped[eventType].count += 1;
          if (eventData.timestamp > grouped[eventType].lastSeen) {
            grouped[eventType].lastSeen = eventData.timestamp;
          }
        }

        // Calculate time-based metrics
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

        const sessions1d = events.filter(e => 
          e.key === 'event:session_start' && 
          e.created_at > oneDayAgo
        ).length;

        const sessions7d = events.filter(e => 
          e.key === 'event:session_start' && 
          e.created_at > sevenDaysAgo
        ).length;

        const sessions30d = events.filter(e => 
          e.key === 'event:session_start' && 
          e.created_at > thirtyDaysAgo
        ).length;

        // Transaction metrics
        const transactions1d = events.filter(e => 
          e.key === 'event:transaction_created' && 
          e.created_at > oneDayAgo
        ).length;

        const transactions7d = events.filter(e => 
          e.key === 'event:transaction_created' && 
          e.created_at > sevenDaysAgo
        ).length;

        // Feature adoption
        const voiceUsage = (grouped['voice_success']?.count || 0);
        const totalTransactions = (grouped['transaction_created']?.count || 0);
        const voiceAdoptionRate = totalTransactions > 0 
          ? Math.round((voiceUsage / totalTransactions) * 100) 
          : 0;

        setStats({
          totalEvents: events.length,
          eventCounts: grouped,
          sessions1d,
          sessions7d,
          sessions30d,
          transactions1d,
          transactions7d,
          voiceAdoptionRate,
          totalTransactions,
          voiceUsage
        });
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="text-center py-8">
            {label('reports.loading', lang)}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="text-center py-8 text-gray-600">
            {label('reports.no-analytics-data-available', lang)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity size={24} className="text-green-600" />
            {label('reports.usage-analytics', lang)}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Session Metrics */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              {label('reports.sessions', lang)}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.sessions1d}</div>
                <div className="text-sm text-blue-600">{label('reports.today', lang)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.sessions7d}</div>
                <div className="text-sm text-blue-600">{label('reports.last-7-days', lang)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.sessions30d}</div>
                <div className="text-sm text-blue-600">{label('reports.last-30-days', lang)}</div>
              </div>
            </div>
          </div>

          {/* Transaction Metrics */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrendingUp size={20} className="text-green-600" />
              {label('reports.transactions', lang)}
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.transactions1d}</div>
                <div className="text-sm text-green-600">{label('reports.today', lang)}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.transactions7d}</div>
                <div className="text-sm text-green-600">{label('reports.last-7-days', lang)}</div>
              </div>
            </div>
            
            {/* Voice Usage */}
            {stats.totalTransactions > 0 && (
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-purple-700">
                    {label('reports.voice-usage', lang)}
                  </div>
                  <div className="text-lg font-bold text-purple-700">
                    {stats.voiceAdoptionRate}%
                  </div>
                </div>
                <div className="text-xs text-purple-600 mt-1">
                  {stats.voiceUsage} {label('reports.of', lang)} {stats.totalTransactions} {label('reports.transactions-2', lang)}
                </div>
              </div>
            )}
          </div>

          {/* Event Counts */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Users size={20} className="text-orange-600" />
              {label('reports.all-events', lang)}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(stats.eventCounts)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([event, data]) => (
                  <div key={event} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                    <span className="text-sm font-medium text-gray-700">
                      {event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <span className="text-sm font-bold text-gray-900">{data.count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Debug Info (for development) */}
          {import.meta.env.DEV && (
            <div className="text-xs text-gray-400 text-center">
              Total Events: {stats.totalEvents}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
