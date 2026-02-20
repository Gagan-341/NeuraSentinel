interface LeaderboardEntry {
  name: string;
  stat: string;
  detail: string;
}

const fastestSwings: LeaderboardEntry[] = [
  { name: 'Aayush', stat: '34.9 m/s', detail: 'Forehand drive – Bengaluru Open qualifier' },
  { name: 'Aarya', stat: '33.2 m/s', detail: 'Smash practice – Pune training camp' },
  { name: 'Eshaan', stat: '31.5 m/s', detail: 'Backhand counter – college showcase' },
];

const accuracyMasters: LeaderboardEntry[] = [
  { name: 'Meera', stat: '93.1%', detail: 'Serve consistency challenge' },
  { name: 'Dev', stat: '90.4%', detail: 'Push rally drill' },
  { name: 'Ravi', stat: '88.8%', detail: 'Chop defense ladder' },
];

const weeklyImprovers: LeaderboardEntry[] = [
  { name: 'Tanvi', stat: '+9.5%', detail: 'Backhand accuracy week-over-week' },
  { name: 'Pranav', stat: '+7.1%', detail: 'Serve placement consistency' },
  { name: 'Luis', stat: '+6.3%', detail: 'Forehand tempo control' },
];

function renderTable(title: string, caption: string, data: LeaderboardEntry[]) {
  return (
    <div className="result-card" style={{ flex: '1 1 280px' }}>
      <h3>{title}</h3>
      <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>{caption}</p>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Stat</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.name}>
              <td>#{idx + 1}</td>
              <td>
                <strong>{row.name}</strong>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{row.detail}</p>
              </td>
              <td>{row.stat}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeaderboardPage() {
  return (
    <section className="leaderboard">
      <h2 className="page-title">Leaderboard</h2>
      <p className="section-subtitle" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Coming soon: a live, cloud-backed leaderboard of real sessions. For now, these sample entries
        act as a preview of how the leaderboard will look during the demo.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {renderTable('Fastest Swings', 'Top explosive swings captured this week.', fastestSwings)}
        {renderTable('Accuracy Masters', 'Highest average precision over the last 5 sessions.', accuracyMasters)}
        {renderTable('Momentum Board', 'Biggest accuracy gain compared to previous week.', weeklyImprovers)}
      </div>
    </section>
  );
}
