import React, { useState, useEffect } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlogPost } from '../types';
import { supabase, getImageUrl } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { usePageMeta } from '../components/PageMeta';
import DOMPurify from 'dompurify';

const BlogDetail: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  // Meta + Open Graph por ARTÍCULO (antes se compartía la imagen/texto de la home).
  usePageMeta({
    title: post ? `${post.title} | Unreal Studio` : '',
    description: post ? ((post as any).excerpt || (post as any).summary || (post as any).description || post.title) : undefined,
    image: post?.image ? getImageUrl(post.image) : undefined,
    type: 'article',
  });

  // JSON-LD Article: resultados enriquecidos del artículo en Google.
  useEffect(() => {
    if (!post) return;
    const schema = {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: post.title,
      image: post.image ? [getImageUrl(post.image)] : undefined,
      datePublished: (post as any).published_date || undefined,
      dateModified: (post as any).updated_at || (post as any).published_date || undefined,
      author: { '@type': 'Organization', name: 'Unreal Studio' },
      publisher: { '@type': 'Organization', name: 'Unreal Studio', logo: { '@type': 'ImageObject', url: 'https://unrealstudiobali.com/img/Logos/favicon_io/android-chrome-512x512.png' } },
      mainEntityOfPage: 'https://unrealstudiobali.com' + window.location.pathname,
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-article-ld', '1');
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [post]);

  // Helper date formatter
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
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
            // El título/OG lo gestiona usePageMeta (arriba); no pisar con un document.title fijo.
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
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">{t('blog.loadingArticle')}</p>
          </div>
      );
  }

  if (!post) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-almond text-primary gap-4">
              <h1 className="font-serif text-3xl">{t('blog.articleNotFound')}</h1>
              <Link to="/blog" className="text-xs font-bold uppercase tracking-widest border-b border-primary">{t('blog.backToBlog')}</Link>
          </div>
      );
  }

  return (
    <div className="bg-almond min-h-screen pb-24 transition-colors duration-300">
       <div className="h-[60vh] w-full relative overflow-hidden">
           <img
             src={imgSrc(getImageUrl(post.image), 1600)}
             srcSet={imgSrcSet(getImageUrl(post.image), [600, 1000, 1400, 1800])}
             sizes="100vw"
             onError={imgFallback(getImageUrl(post.image))}
             className="w-full h-full object-cover"
             alt={post.title}
             loading="eager"
             fetchPriority="high"
           />
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
                        <span className="material-symbols-outlined text-sm">arrow_back</span> {t('blog.backToBlog')}
                    </Link>
                </div>
                
                {/* Renderizado de HTML enriquecido para SEO. Saneado con DOMPurify:
                    permite formato del blog pero elimina scripts/eventos (anti-XSS). */}
                <div
                  className="prose prose-lg md:prose-xl max-w-none prose-p:text-primary/70 prose-p:font-light prose-headings:text-primary prose-headings:font-serif prose-strong:text-primary prose-strong:font-bold prose-img:rounded-3xl"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content, { ADD_ATTR: ['target'] }) }}
                />

                <div className="mt-20 pt-12 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <h4 className="text-xl font-bold text-primary mb-2">{t('blog.shareTitle')}</h4>
                        <p className="text-sm text-primary/50 font-medium">{t('blog.shareBody')}</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            title={t('blog.copyLink', 'Copiar enlace')}
                            onClick={() => { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }}
                            className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition shadow-sm group">
                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition">link</span>
                        </button>
                        <button
                            type="button"
                            title={t('blog.share', 'Compartir')}
                            onClick={() => {
                                const data = { title: document.title, url: window.location.href };
                                if (navigator.share) { void navigator.share(data).catch(() => {}); }
                                else { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }
                            }}
                            className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition shadow-sm group">
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