import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsCard } from '../../src/components/cards/NewsCard';
import { HomeFeedFilters } from '../../src/components/home/HomeFeedFilters';
import { filterHomeFeedItems } from '../../src/utils/homeFeedFilter';
import { fetchNewsItems } from '../../src/services/newsApi';
function App() {
  const [items, setItems] = useState([]),
    [filter, setFilter] = useState('all');
  useEffect(() => {
    fetchNewsItems().then((items) => {
      window.__mapped = items;
      setItems(items.map((data) => ({ kind: 'news', id: data.id, data })));
    });
  }, []);
  return (
    <main style={{ maxWidth: 600, margin: 'auto', padding: 16 }}>
      <h1>FCN i medierne</h1>
      <HomeFeedFilters value={filter} onChange={setFilter} />
      {filterHomeFeedItems(items, filter).map((i) => (
        <section key={i.id} data-canonical-id={i.id}>
          <NewsCard
            newsItem={i.data}
            onToggleLike={() =>
              window.__actions.push({ action: 'like', type: 'news', id: i.data.id })
            }
          />
        </section>
      ))}
    </main>
  );
}
createRoot(document.getElementById('root')).render(<App />);
