import React, { useState, useEffect } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlogPost } from '../types';
import { supabase, getImageUrl } from '../lib/supabase';
import { localizeFields, blogTagLabel } from '../lib/projectTerms';
import { usePageMeta } from '../components/PageMeta';
import ArticleView from '../components/ArticleView';

const BlogDetail: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [rawPost, setPost] = useState<BlogPost | null>(null);
  const post = rawPost && localizeFields(rawPost, ['title', 'description', 'content'], i18n.language);
  const [loading, setLoading] = useState(true);

  // Meta + Open Graph por ARTÍCULO (antes se compartía la imagen/texto de la home).
  usePageMeta({
    // Sufijo de marca solo si cabe en 60 caracteres (igual que el prerender).
    title: post ? (post.title.length <= 44 ? `${post.title} | Unreal Studio` : post.title) : '',
    description: post ? ((post as any).excerpt || (post as any).summary || (post as any).description || post.title) : undefined,
    image: post?.image ? getImageUrl(post.image) : undefined,
    type: 'article',
  });

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
            .eq('is_published', true)
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
    <ArticleView
      title={post.title}
      image={getImageUrl(post.image)}
      tagLabel={blogTagLabel(post.tag, t)}
      dateText={formatDate(post.published_date)}
      html={post.content}
      backTo="/blog"
      backLabel={t('blog.backToBlog')}
    />
  );
};

export default BlogDetail;