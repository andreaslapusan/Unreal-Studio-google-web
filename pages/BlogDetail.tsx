import React, { useState, useEffect } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlogPost } from '../types';
import PageLoader from '../components/PageLoader';
import InlineNotFound from '../components/InlineNotFound';
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
        return new Date(dateOnly(dateString)).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
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
      return <PageLoader label={t('blog.loadingArticle')} />;
  }

  if (!post) {
      return (
          <InlineNotFound
            title={t('blog.articleNotFound')}
            backTo="/blog"
            backLabel={t('blog.backToBlog')}
            icon="article"
          />
      );
  }

  return (
    <article className="bg-almond min-h-screen pb-24 md:pb-32">
       <header className="max-w-[1440px] mx-auto px-5 md:px-12 pt-8 md:pt-14">
           <Link to="/blog" className="us-link text-primary/70 hover:text-primary">
               <span className="material-symbols-outlined text-base">arrow_back</span> {t('blog.backToBlog')}
           </Link>
           <div className="mt-10 md:mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 us-label text-primary/50">
               <span className="text-clay">{post.tag}</span>
               <time className="us-num">{formatDate(post.published_date)}</time>
           </div>
           <h1 className="font-serif text-primary text-[2.2rem] leading-[1.04] sm:text-5xl md:text-6xl xl:text-7xl mt-5 max-w-6xl us-rise">{post.title}</h1>
       </header>

       <div className="max-w-[1440px] mx-auto px-5 md:px-12 mt-10 md:mt-16">
           <div className="relative overflow-hidden aspect-[4/3] md:aspect-[21/9] bg-primary/10 us-curtain">
               <img
                 src={imgSrc(getImageUrl(post.image), 1800)}
                 srcSet={imgSrcSet(getImageUrl(post.image), [700, 1100, 1500, 2000])}
                 sizes="100vw"
                 onError={imgFallback(getImageUrl(post.image))}
                 className="absolute inset-0 w-full h-full object-cover"
                 alt={post.title}
                 loading="eager"
                 fetchPriority="high"
               />
           </div>
       </div>

       <div className="max-w-[1440px] mx-auto px-5 md:px-12 mt-12 md:mt-20">
                {/* HTML enriquecido saneado con DOMPurify (anti-XSS); medida de lectura ~68ch. */}
                <div
                  className="prose prose-lg md:prose-xl max-w-[68ch] mx-auto prose-p:text-primary/75 prose-p:leading-relaxed prose-headings:text-primary prose-headings:font-serif prose-headings:mt-14 prose-strong:text-primary prose-strong:font-semibold prose-a:text-clay prose-a:underline-offset-4 prose-li:text-primary/75 prose-blockquote:border-l prose-blockquote:border-clay prose-blockquote:text-primary/80 prose-blockquote:font-normal prose-blockquote:not-italic prose-img:rounded-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content, { ADD_ATTR: ['target'] }) }}
                />

                <div className="mt-20 pt-10 border-t border-primary/15 flex flex-col md:flex-row justify-between md:items-center gap-8 max-w-[68ch] mx-auto w-full">
                    <div>
                        <h2 className="font-serif text-2xl text-primary">{t('blog.shareTitle')}</h2>
                        <p className="text-[15px] text-primary/55 mt-2">{t('blog.shareBody')}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            title={t('blog.copyLink', 'Copiar enlace')}
                            aria-label={t('blog.copyLink', 'Copiar enlace')}
                            onClick={() => { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }}
                            className="w-12 h-12 rounded-full border border-primary/20 flex items-center justify-center text-primary hover:bg-primary hover:text-almond transition-colors duration-300">
                            <span className="material-symbols-outlined text-xl">link</span>
                        </button>
                        <button
                            type="button"
                            title={t('blog.share', 'Compartir')}
                            aria-label={t('blog.share', 'Compartir')}
                            onClick={() => {
                                const data = { title: document.title, url: window.location.href };
                                if (navigator.share) { void navigator.share(data).catch(() => {}); }
                                else { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }
                            }}
                            className="w-12 h-12 rounded-full border border-primary/20 flex items-center justify-center text-primary hover:bg-primary hover:text-almond transition-colors duration-300">
                            <span className="material-symbols-outlined text-xl">ios_share</span>
                        </button>
                    </div>
                </div>
       </div>
    </article>
  );
};

export default BlogDetail;