import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';

async function ensureDataDirectory(dbPath: string) {
  const dataDir = path.dirname(dbPath);
  await fs.mkdir(dataDir, { recursive: true });
}

async function analyzeApiCalls() {
  const dbPath = '/root/zizcon-v2/data/api-calls.db';
  try {
    await ensureDataDirectory(dbPath);

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY // Open in read-only mode for analysis
    });

    // Enable WAL mode for better concurrent access
    await db.run('PRAGMA journal_mode = WAL');
    await db.run('PRAGMA busy_timeout = 5000');

    try {
      // Get total calls per API source
      const totalCalls = await db.all(`
        SELECT 
          api_source,
          COUNT(*) as call_count,
          MIN(timestamp) as first_call,
          MAX(timestamp) as last_call,
          (MAX(timestamp) - MIN(timestamp)) / 1000.0 as duration_seconds
        FROM api_calls 
        GROUP BY api_source
        ORDER BY call_count DESC
      `);

      console.log('\nTotal API Calls by Source:');
      console.log('---------------------------');
      for (const row of totalCalls) {
        console.log(`${row.api_source}:`);
        console.log(`  Calls: ${row.call_count}`);
        console.log(`  First Call: ${new Date(row.first_call).toISOString()}`);
        console.log(`  Last Call: ${new Date(row.last_call).toISOString()}`);
        console.log(`  Duration: ${row.duration_seconds.toFixed(1)} seconds`);
        console.log(`  Avg Calls/Second: ${(row.call_count / row.duration_seconds).toFixed(2)}`);
        console.log('---------------------------');
      }

      // Get calls per minute (last hour)
      const lastHourCalls = await db.all(`
        WITH RECURSIVE 
          minutes(minute) AS (
            SELECT datetime((SELECT MAX(timestamp)/1000 FROM api_calls), 'unixepoch', '-59 minutes')
            UNION ALL
            SELECT datetime(minute, '+1 minute')
            FROM minutes
            WHERE minute < datetime((SELECT MAX(timestamp)/1000 FROM api_calls), 'unixepoch')
          )
        SELECT 
          m.minute,
          api_source,
          COUNT(ac.timestamp) as calls_per_minute
        FROM minutes m
        LEFT JOIN api_calls ac 
          ON strftime('%Y-%m-%d %H:%M', datetime(ac.timestamp/1000, 'unixepoch')) = m.minute
          AND ac.timestamp > (SELECT MAX(timestamp) - 3600000 FROM api_calls)
        GROUP BY m.minute, api_source
        ORDER BY m.minute DESC, api_source
      `);

      console.log('\nCalls per Minute (Last Hour):');
      console.log('---------------------------');
      let currentMinute = '';
      for (const row of lastHourCalls) {
        if (row.minute !== currentMinute) {
          currentMinute = row.minute;
          console.log(`\n${row.minute}:`);
        }
        if (row.api_source) {
          console.log(`  ${row.api_source}: ${row.calls_per_minute} calls`);
        }
      }

      // Get busiest minutes
      const busiestMinutes = await db.all(`
        SELECT 
          strftime('%Y-%m-%d %H:%M', datetime(timestamp/1000, 'unixepoch')) as minute,
          COUNT(*) as total_calls,
          GROUP_CONCAT(DISTINCT api_source) as sources
        FROM api_calls 
        GROUP BY minute
        ORDER BY total_calls DESC
        LIMIT 5
      `);

      console.log('\nBusiest Minutes:');
      console.log('---------------------------');
      for (const row of busiestMinutes) {
        console.log(`${row.minute}:`);
        console.log(`  Total Calls: ${row.total_calls}`);
        console.log(`  Sources: ${row.sources}`);
        console.log('---------------------------');
      }

      // Get average calls per hour by API source
      const avgCallsPerHour = await db.all(`
        WITH hourly_calls AS (
          SELECT 
            api_source,
            strftime('%Y-%m-%d %H', datetime(timestamp/1000, 'unixepoch')) as hour,
            COUNT(*) as calls
          FROM api_calls 
          GROUP BY api_source, hour
        )
        SELECT 
          api_source,
          ROUND(AVG(calls), 2) as avg_calls_per_hour,
          MIN(calls) as min_calls,
          MAX(calls) as max_calls,
          COUNT(DISTINCT hour) as total_hours
        FROM hourly_calls
        GROUP BY api_source
        ORDER BY avg_calls_per_hour DESC
      `);

      console.log('\nAverage Calls per Hour by API Source:');
      console.log('---------------------------');
      for (const row of avgCallsPerHour) {
        console.log(`${row.api_source}:`);
        console.log(`  Average: ${row.avg_calls_per_hour}`);
        console.log(`  Min: ${row.min_calls}`);
        console.log(`  Max: ${row.max_calls}`);
        console.log(`  Hours Analyzed: ${row.total_hours}`);
        console.log('---------------------------');
      }
    } finally {
      await db.close();
    }
  } catch (error) {
    console.error('Error analyzing API calls:', error);
    process.exit(1);
  }
}

analyzeApiCalls().catch(console.error); 