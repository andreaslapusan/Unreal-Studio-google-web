import React, { useState, useEffect, useMemo } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlogPost } from '../types';
import PageLoader from '../components/PageLoader';
import { supabase, getImageUrl } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { usePageMeta } from '../components/PageMeta';

const ALL_TAG = '__all__'; // sentinel — preserved across language switches

const Blog: React.FC = () => {
  const { t } = useTranslation();
  const catLabel = (tag) => { const k = { 'MERCADO':'market', 'INVERSIÓN':'investment', 'LEGAL':'legal' }[tag]; return k ? t('blog.cat.'+k, { defaultValue: tag }) : tag; };
  usePageMeta({ title: t('blog.title'), description: t('blog.metaDescription') });
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState(ALL_TAG);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Helper date formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
        return new Date(dateOnly(dateString)).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  useEffect(() => {
    const fetchBlogs = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
            .from('blogs')
            .select('*')
            .order('published_date', { ascending: false });
        if (data) setBlogs(data as unknown as BlogPost[]);
      } catch (error) {
        console.error('Error fetching blogs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchBlogs();
  }, []);

  const allTags = useMemo(() => {
    const tags = blogs.map(b => (b.tag || '').toUpperCase()).filter(Boolean);
    return [ALL_TAG, ...Array.from(new Set(tags))];
  }, [blogs]);

  const filteredBlogs = useMemo(() => {
    let result = [...blogs];
    if (selectedTag !== ALL_TAG) {
      result = result.filter(b => (b.tag || '').toUpperCase() === selectedTag);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.description?.toLowerCase().includes(q) ||
        b.tag?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const dateA = new Date(a.published_date).getTime();
      const dateB = new Date(b.published_date).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
    return result;
  }, [blogs, selectedTag, sortOrder, searchQuery]);

  if (loading) {
    return <PageLoader label={t('blog.loading')} />;
  }

  return (
    <div className="bg-almond min-h-screen pt-20 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center space-y-6">
          <span className="inline-flex items-center gap-2.5 text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-primary/45"><span className="h-px w-8 bg-primary/35"></span>Unreal Studio · Bali<span className="h-px w-8 bg-primary/35"></span></span>
          <h1 className="text-5xl md:text-7xl text-primary font-serif tracking-[-0.02em] leading-[1.04]">{t('blog.heroTitle')}</h1>
          <p className="text-xl text-primary/70 font-light max-w-2xl mx-auto leading-relaxed">
            {t('blog.heroSubtitle')}
          </p>
        </header>

        {/* Filtros */}
        <div className="mb-12 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Buscador */}
          <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-primary/5 w-full lg:max-w-md">
            <span className="material-symbols-outlined text-primary/30">search</span>
            <input
              type="text"
              placeholder={t('blog.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-primary text-sm font-medium w-full placeholder:text-primary/30"
            />
          </div>

          <div className="flex gap-3 items-center flex-wrap">
            {/* Tags */}
            {allTags.map(tag => (
              <button 
                key={tag} 
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition ${
                  selectedTag === tag 
                    ? 'bg-primary text-white shadow-lg' 
                    : 'bg-white text-primary/50 hover:text-primary border border-primary/5'
                }`}
              >
                {tag === ALL_TAG ? t('blog.all') : catLabel(tag)}
              </button>
            ))}

            {/* Ordenar */}
            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-primary/5">
              <span className="material-symbols-outlined text-primary/30 text-sm">sort</span>
              <select
                aria-label={t('blog.sortNewest')}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-primary outline-none cursor-pointer appearance-none"
              >
                <option value="newest">{t('blog.sortNewest')}</option>
                <option value="oldest">{t('blog.sortOldest')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resultados */}
        {filteredBlogs.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">search</span>
            <p className="text-primary/40 font-bold uppercase tracking-widest text-xs">{t('blog.noResults')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {filteredBlogs.map(post => (
              <Link key={post.id} to={`/blog/${post.slug || post.id}`} className="group block h-full">
                <div className="aspect-[16/10] rounded-[2rem] overflow-hidden mb-6 relative shadow-lg">
                  <img
                    loading="lazy"
                    src={imgSrc(getImageUrl(post.image), 600)}
                    srcSet={imgSrcSet(getImageUrl(post.image), [320, 600, 900])}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    onError={imgFallback(getImageUrl(post.image))}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-[900ms] ease-out group-hover:scale-[1.06]"
                    alt={post.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="inline-flex items-center gap-2 text-[10px] font-black text-primary/45 uppercase tracking-[0.2em]"><span className="h-px w-5 bg-primary/30" />{catLabel(post.tag)}</span>
                    <span className="text-[10px] font-bold text-primary/30 uppercase tracking-widest">{formatDate(post.published_date)}</span>
                  </div>
                  <h3 className="text-2xl md:text-[1.6rem] font-serif text-primary mb-3 leading-[1.15] tracking-[-0.01em] group-hover:text-black transition-colors">{post.title}</h3>
                  <p className="text-sm text-primary/60 font-light leading-relaxed line-clamp-3">{post.description}</p>
                  <span className="inline-flex items-center gap-1.5 mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-primary/50 group-hover:text-primary transition-colors">{t('blog.readMore', { defaultValue: 'Leer más' })}<span className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span></span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Blog;