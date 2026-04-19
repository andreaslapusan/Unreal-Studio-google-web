import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BlogPost } from '../types';
import { supabase, getImageUrl } from '../lib/supabase';

const BlogDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  
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
    const fetchPost = async () => {
      if (!slug) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
            .from('blogs')
            .select('*')
            .eq('slug', slug)
            .single();

        if (data) {
            setPost(data as unknown as BlogPost);
            document.title = `${(data as unknown as BlogPost).title} | Unreal Studio Madrid`;
        } else if (error) {
            console.error('Error fetching post:', error);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
      return (
          <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">Cargando artículo...</p>
          </div>
      );
  }

  if (!post) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-almond text-primary gap-4">
              <h1 className="font-serif text-3xl">Artículo no encontrado</h1>
              <Link to="/blog" className="text-xs font-bold uppercase tracking-widest border-b border-primary">Volver al blog</Link>
          </div>
      );
  }

  return (
    <div className="bg-almond min-h-screen pb-24 transition-colors duration-300">
       <div className="h-[60vh] w-full relative overflow-hidden">
           <img src={getImageUrl(post.image)} className="w-full h-full object-cover" alt={post.title} />
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
           <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-12 lg:p-20 max-w-7xl mx-auto">
               <span className="bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg w-fit mb-6 shadow-xl">{post.tag}</span>
               <h1 className="text-4xl md:text-6xl lg:text-7xl text-white font-serif leading-tight max-w-5xl">{post.title}</h1>
           </div>
       </div>

       <div className="max-w-6xl mx-auto px-4 md:px-12 -mt-16 relative z-10">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-16 lg:p-20 shadow-2xl border border-primary/5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-16 border-b border-gray-100 pb-8 gap-4">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary/30">calendar_today</span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{formatDate(post.published_date)}</span>
                    </div>
                    <Link to="/blog" className="text-[10px] font-black text-primary uppercase tracking-widest hover:translate-x-[-4px] transition-transform flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Volver al Blog
                    </Link>
                </div>
                
                {/* Renderizado de HTML enriquecido para SEO */}
                <div 
                  className="prose prose-lg md:prose-xl max-w-none prose-p:text-primary/70 prose-p:font-light prose-headings:text-primary prose-headings:font-serif prose-strong:text-primary prose-strong:font-bold prose-img:rounded-3xl"
                  dangerouslySetInnerHTML={{ __html: post.content }}
                />

                <div className="mt-20 pt-12 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <h4 className="text-xl font-bold text-primary mb-2">¿Te ha gustado este artículo?</h4>
                        <p className="text-sm text-primary/50 font-medium">Compártelo con otros inversores interesados en el mercado internacional.</p>
                    </div>
                    <div className="flex gap-4">
                        <button className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition shadow-sm group">
                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition">link</span>
                        </button>
                        <button className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition shadow-sm group">
                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition">share</span>
                        </button>
                    </div>
                </div>
           </div>
       </div>
    </div>
  );
};

export default BlogDetail;