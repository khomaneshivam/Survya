import { useState, useEffect, useCallback, useMemo } from 'react';
import { automationApi } from '../api/automationApi';

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [industry, setIndustry] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await automationApi.getTemplates({ industry, category, search });
      if (data && data.success) {
        setTemplates(data.templates || []);
      } else {
        setError(data?.error || 'Failed to load templates');
      }
    } catch (err) {
      setError(err.message || 'Network error fetching templates');
    } finally {
      setLoading(false);
    }
  }, [industry, category, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const industries = useMemo(() => {
    const set = new Set();
    templates.forEach(t => {
      if (t.industry) set.add(t.industry);
    });
    return ['ALL', ...Array.from(set)];
  }, [templates]);

  const categories = useMemo(() => {
    const set = new Set();
    templates.forEach(t => {
      if (t.category) set.add(t.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [templates]);

  return {
    templates,
    loading,
    error,
    industry,
    setIndustry,
    category,
    setCategory,
    search,
    setSearch,
    industries,
    categories,
    refetch: fetchTemplates
  };
}

