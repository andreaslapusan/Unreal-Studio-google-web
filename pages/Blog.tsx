import React, { useState, useEffect, useMemo } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlogPost } from '../types';
import PageLoader from '../components/PageLoader';
import Reveal from '../components/Reveal';
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

  const PostMeta = ({ post }: { post: BlogPost }) => (
    <div className="flex justify-between items-center gap-3 us-label text-primary/45">
      <span className="text-clay">{catLabel(post.tag)}</span>
      <time className="us-num">{formatDate(post.published_date)}</time>
    </div>
  );
  const [lead, ...rest] = filteredBlogs;

  return (
    <div className="bg-almond min-h-screen pt-10 md:pt-16 pb-24 md:pb-32">
      <div className="max-w-[1440px] mx-auto px-5 md:px-12">
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end mb-12 md:mb-16">
          <h1 className="lg:col-span-8 font-display uppercase text-primary text-[2.6rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[6rem] xl:leading-[0.92] us-rise">{t('blog.heroTitle')}</h1>
          <p className="lg:col-span-4 text-base md:text-lg text-primary/65 leading-relaxed lg:pb-3">{t('blog.heroSubtitle')}</p>
        </header>

        {/* Filtros: buscador de línea + categorías como índice */}
        <div className="mb-12 md:mb-16 pb-6 border-b border-primary/15 flex flex-col lg:flex-row gap-6 lg:items-end justify-between">
          <label className="flex items-center gap-3 border-b border-primary/25 focus-within:border-clay transition-colors w-full lg:max-w-sm py-2">
            <span className="material-symbols-outlined text-primary/40" aria-hidden="true">search</span>
            <input
              type="search"
              aria-label={t('blog.search')}
              placeholder={t('blog.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none focus:ring-0 p-0 text-primary text-base w-full placeholder:text-primary/35"
            />
          </label>

          <div className="flex gap-2 items-center flex-wrap">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                aria-pressed={selectedTag === tag}
                className={`us-label px-3.5 py-2.5 rounded-xl border transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-clay ${
                  selectedTag === tag ? 'bg-primary text-almond border-primary' : 'border-primary/20 text-primary/60 hover:text-primary hover:border-primary/50'
                }`}
              >
                {tag === ALL_TAG ? t('blog.all') : catLabel(tag)}
              </button>
            ))}
            <select
              aria-label={t('blog.sortNewest')}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="us-label bg-transparent border border-primary/20 rounded-xl pl-3.5 py-2.5 text-primary outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-clay cursor-pointer"
            >
              <option value="newest">{t('blog.sortNewest')}</option>
              <option value="oldest">{t('blog.sortOldest')}</option>
            </select>
          </div>
        </div>

        {filteredBlogs.length === 0 ? (
          <div className="text-center py-24 border-b border-primary/15">
            <span className="material-symbols-outlined text-4xl text-clay mb-4 block" aria-hidden="true">search_off</span>
            <p className="us-label text-primary/50">{t('blog.noResults')}</p>
          </div>
        ) : (
          <>
            {/* Artículo de apertura a doble página */}
            <Link to={`/blog/${lead.slug || lead.id}`} className="group grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end mb-16 md:mb-24 outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-almond">
              <div className="lg:col-span-7 us-zoom relative overflow-hidden aspect-[3/2] bg-primary/10">
                <img loading="eager" src={imgSrc(getImageUrl(lead.image), 1200)} srcSet={imgSrcSet(getImageUrl(lead.image), [600, 900, 1200, 1600])} sizes="(max-width: 1024px) 100vw, 58vw" onError={imgFallback(getImageUrl(lead.image))} className="absolute inset-0 w-full h-full object-cover" alt={lead.title} />
              </div>
              <div className="lg:col-span-5">
                <PostMeta post={lead} />
                <h2 className="font-serif text-3xl md:text-4xl xl:text-5xl text-primary mt-4 leading-[1.08] transition-colors group-hover:text-clay">{lead.title}</h2>
                <p className="text-base md:text-lg text-primary/60 leading-relaxed mt-4 line-clamp-4">{lead.description}</p>
                <span className="us-link text-primary mt-6">{t('blog.readMore', { defaultValue: 'Leer más' })}<span className="material-symbols-outlined text-base">arrow_forward</span></span>
              </div>
            </Link>

            {rest.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14 pt-12 md:pt-16 border-t border-primary/15">
                {rest.map((post, i) => (
                  <Reveal key={post.id} delay={(i % 3) * 90} className="h-full">
                    <Link to={`/blog/${post.slug || post.id}`} className="group flex flex-col h-full outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-almond">
                      <div className="us-zoom relative overflow-hidden aspect-[3/2] bg-primary/10 mb-5">
                        <img loading="lazy" src={imgSrc(getImageUrl(post.image), 700)} srcSet={imgSrcSet(getImageUrl(post.image), [400, 700, 1000])} sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" onError={imgFallback(getImageUrl(post.image))} className="absolute inset-0 w-full h-full object-cover" alt={post.title} />
                      </div>
                      <PostMeta post={post} />
                      <h3 className="font-serif text-xl md:text-2xl text-primary mt-3 leading-snug transition-colors group-hover:text-clay">{post.title}</h3>
                      <p className="text-[15px] text-primary/60 leading-relaxed mt-3 line-clamp-3">{post.description}</p>
                    </Link>
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Blog;