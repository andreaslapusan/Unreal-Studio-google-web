import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BlogPost } from '../types';
import { supabase, getImageUrl } from '../lib/supabase';

const Blog: React.FC = () => {
  useEffect(() => { document.title = 'Blog | Unreal Studio Madrid'; }, []);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState('Todos');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // Helper date formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    return ['Todos', ...Array.from(new Set(tags))];
  }, [blogs]);

  const filteredBlogs = useMemo(() => {
    let result = [...blogs];
    if (selectedTag !== 'Todos') {
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
    return (
      <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">Cargando noticias...</p>
      </div>
    );
  }

  return (
    <div className="bg-almond min-h-screen pt-20 pb-24 px-6 md:px-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-5xl md:text-7xl text-primary font-serif mb-6">Blog & Noticias</h1>
          <p className="text-xl text-primary/70 font-light max-w-2xl mx-auto">
            Actualidad del mercado inmobiliario en Bali, tendencias de inversión y guías legales.
          </p>
        </header>

        {/* Filtros */}
        <div className="mb-12 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Buscador */}
          <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-primary/5 w-full lg:max-w-md">
            <span className="material-symbols-outlined text-primary/30">search</span>
            <input 
              type="text" 
              placeholder="Buscar artículos..." 
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
                {tag}
              </button>
            ))}

            {/* Ordenar */}
            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-primary/5">
              <span className="material-symbols-outlined text-primary/30 text-sm">sort</span>
              <select 
                value={sortOrder} 
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-primary outline-none cursor-pointer appearance-none"
              >
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resultados */}
        {filteredBlogs.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">search</span>
            <p className="text-primary/40 font-bold uppercase tracking-widest text-xs">No se encontraron artículos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {filteredBlogs.map(post => (
              <Link key={post.id} to={`/blog/${post.slug || post.id}`} className="group block h-full">
                <div className="aspect-[16/10] rounded-[2rem] overflow-hidden mb-6 relative shadow-lg">
                  <img loading="lazy" src={getImageUrl(post.image)} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition duration-700 group-hover:scale-105" alt={post.title} />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">{post.tag}</span>
                    <span className="text-[10px] font-bold text-primary/30 uppercase tracking-widest">{formatDate(post.published_date)}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-primary mb-3 leading-snug group-hover:text-primary/70 transition">{post.title}</h3>
                  <p className="text-sm text-primary/60 font-medium leading-relaxed line-clamp-3">{post.description}</p>
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