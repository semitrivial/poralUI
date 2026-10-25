/*
 * api.c -- thin string-based wrapper around PORAL for the WebAssembly calculator.
 *
 * Patterns cross the JS/C boundary in a compact text encoding:
 *
 *   P<point>;<node0>;<node1>;...
 *
 * where each node is "<less1>" or "<less1>=<d1>.<d2>...", less1 being the
 * position of the largest node it is <=_1 (its own position if none) and
 * d1>=d2>=... the positions of its (indecomposable) summands.
 * Example: epsilon_0 = "P1;0;2;2=1.1".
 *
 * Every api_* function returning a string returns either an encoded
 * pattern, a small result like "1", or "ERR:<message>".  The returned
 * buffer is static and overwritten by the next call.
 */
#include "../patterns.h"
#include "../por.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *outbuf = NULL;
static size_t outcap = 0;

static const char *out( const char *fmt, const char *arg )
{
  size_t need = strlen( fmt ) + ( arg ? strlen( arg ) : 0 ) + 16;
  if ( need > outcap )
  {
    outcap = need * 2;
    outbuf = realloc( outbuf, outcap );
  }
  snprintf( outbuf, outcap, fmt, arg ? arg : "" );
  return outbuf;
}

static const char *err( const char *msg )
{
  return out( "ERR:%s", msg );
}

static int initialized = 0;

int api_init( void )
{
  if ( !initialized )
  {
    patterns_initialize();
    initialized = 1;
  }
  return 1;
}

/* ---------- encoding ---------- */

static const char *encode( pattern *p )
{
  size_t cap;
  char *buf, *b;
  node *n, **d;

  if ( !p )
    return err( global_pattern_error[0] ? global_pattern_error : "Operation failed." );
  if ( p == pattern_too_large )
    return err( "Result exceeds the node limit of this build." );

  cap = 64 + (size_t) p->nodes * 64;
  buf = malloc( cap );
  b = buf;
  b += sprintf( b, "P%d", p->point->position );
  for ( n = p->first_node; n; n = n->next )
  {
    b += sprintf( b, ";%d", n->less1->position );
    if ( n->decomposition )
    {
      for ( d = n->decomposition; *d; d++ )
        b += sprintf( b, "%c%d", d == n->decomposition ? '=' : '.', (*d)->position );
    }
  }
  out( "%s", buf );
  free( buf );
  return outbuf;
}

/*
 * Parse an encoded pattern into a fresh, deduplicated library pattern.
 * Returns NULL and sets *why on failure.
 */
static pattern *decode( const char *s, const char **why )
{
  static char msg[256];
  int point, count = 0, i, k;
  int *less1 = NULL, **dec = NULL, *declen = NULL;
  const char *c;
  pattern *p;
  node *n, **nodes;

  *why = msg;
  if ( !s || *s != 'P' )
  {
    snprintf( msg, sizeof msg, "Malformed pattern string." );
    return NULL;
  }
  point = atoi( s + 1 );
  for ( c = s; *c; c++ )
    if ( *c == ';' )
      count++;
  if ( count < 1 || count > MAX_NODES_PER_PATTERN_UPPER )
  {
    snprintf( msg, sizeof msg, "A pattern must have between 1 and %d nodes.", MAX_NODES_PER_PATTERN_UPPER );
    return NULL;
  }
  if ( point < 0 || point >= count )
  {
    snprintf( msg, sizeof msg, "Designated point out of range." );
    return NULL;
  }

  less1 = calloc( count, sizeof( int ) );
  dec = calloc( count, sizeof( int * ) );
  declen = calloc( count, sizeof( int ) );

  c = strchr( s, ';' );
  for ( i = 0; i < count; i++ )
  {
    c++;  /* skip ';' */
    less1[i] = (int) strtol( c, (char **) &c, 10 );
    if ( less1[i] < i || less1[i] >= count )
    {
      snprintf( msg, sizeof msg, "Node %d: <=_1 target must be at or after the node.", i );
      goto fail;
    }
    if ( *c == '=' )
    {
      dec[i] = calloc( count + 1, sizeof( int ) );
      do
      {
        c++;
        dec[i][declen[i]] = (int) strtol( c, (char **) &c, 10 );
        if ( dec[i][declen[i]] <= 0 || dec[i][declen[i]] >= i )
        {
          snprintf( msg, sizeof msg, "Node %d: summands must be nonzero earlier nodes.", i );
          goto fail;
        }
        if ( dec[dec[i][declen[i]]] )
        {
          snprintf( msg, sizeof msg, "Node %d: summands must be indecomposable.", i );
          goto fail;
        }
        if ( declen[i] && dec[i][declen[i]] > dec[i][declen[i] - 1] )
        {
          snprintf( msg, sizeof msg, "Node %d: summands must be in non-increasing order.", i );
          goto fail;
        }
        declen[i]++;
      } while ( *c == '.' );
      if ( declen[i] < 2 )
      {
        snprintf( msg, sizeof msg, "Node %d: a decomposition needs at least two summands.", i );
        goto fail;
      }
    }
    if ( *c && *c != ';' )
    {
      snprintf( msg, sizeof msg, "Unexpected character '%c'.", *c );
      goto fail;
    }
  }
  if ( dec[0] || less1[0] != 0 )
  {
    snprintf( msg, sizeof msg, "Node 0 must be a plain indecomposable node (zero)." );
    goto fail;
  }

  /*
   * Build the pattern by hand (new_pattern() dedups before the structure is
   * filled in, which could alias an existing pattern).
   */
  p = copy_pattern( additive_zero );
  for ( i = 1; i < count; i++ )
    insert_node_before( NULL, p );

  nodes = malloc( sizeof( node * ) * count );
  for ( i = 0, n = p->first_node; n; n = n->next, i++ )
    nodes[i] = n;
  for ( i = 0; i < count; i++ )
  {
    nodes[i]->less1 = nodes[less1[i]];
    if ( dec[i] )
    {
      nodes[i]->decomposition = calloc( declen[i] + 1, sizeof( node * ) );
      for ( k = 0; k < declen[i]; k++ )
        nodes[i]->decomposition[k] = nodes[dec[i][k]];
    }
  }
  p->point = nodes[point];
  free( nodes );
  transitively_close_less1( p );
  fix_node_names( p );

  for ( i = 0; i < count; i++ )
    free( dec[i] );
  free( dec );
  free( less1 );
  free( declen );

  return eliminate_duplicate_pattern( p );

fail:
  for ( i = 0; i < count; i++ )
    free( dec[i] );
  free( dec );
  free( less1 );
  free( declen );
  return NULL;
}

#define DECODE( var, str ) \
  do { const char *why_; global_pattern_error[0] = '\0'; \
       if ( !( (var) = decode( (str), &why_ ) ) ) return err( why_ ); } while ( 0 )

/* ---------- operations ---------- */

const char *api_normalize( const char *a )
{
  pattern *p;
  DECODE( p, a );
  return encode( p );
}

const char *api_constant( const char *name )
{
  api_init();
  if ( !strcmp( name, "0" ) ) return encode( additive_zero );
  if ( !strcmp( name, "1" ) ) return encode( additive_one );
  if ( !strcmp( name, "w" ) ) return encode( additive_omega );
  return err( "Unknown constant." );
}

const char *api_binary( const char *op, const char *a, const char *b )
{
  pattern *p, *q, *r;
  api_init();
  DECODE( p, a );
  DECODE( q, b );
  if ( !strcmp( op, "add" ) )
    r = pattern_sum( p, q );
  else if ( !strcmp( op, "mul" ) )
    r = pattern_product( p, q );
  else if ( !strcmp( op, "amal" ) )
  {
    /* Like pattern_amalgamate(), but also report where each point embeds. */
    amal *am;
    int i1, i2;
    char tail[32];
    setup_scratch_workspace();
    am = amalgamate( copy_pattern( p ), copy_pattern( q ) );
    unsetup_scratch_workspace();
    i1 = am->p1_in_p->position;
    i2 = am->p2_in_p->position;
    r = copy_pattern( am->p );
    fix_node_names( r );
    clean_scratch_workspace();
    r = eliminate_duplicate_pattern( r );
    encode( r );
    if ( outbuf && strncmp( outbuf, "ERR:", 4 ) )
    {
      snprintf( tail, sizeof tail, "|%d|%d", i1, i2 );
      if ( strlen( outbuf ) + strlen( tail ) + 1 > outcap )
      {
        outcap = strlen( outbuf ) + strlen( tail ) + 64;
        outbuf = realloc( outbuf, outcap );
      }
      strcat( outbuf, tail );
    }
    return outbuf;
  }
  else if ( !strcmp( op, "cmp" ) )
  {
    static char buf[8];
    snprintf( buf, sizeof buf, "%d", pattern_compare( p, q ) );
    return buf;
  }
  else
    return err( "Unknown binary operation." );
  return encode( r );
}

const char *api_unary( const char *op, const char *a )
{
  pattern *p, *r;
  api_init();
  DECODE( p, a );
  if ( !strcmp( op, "exp" ) )
    r = pattern_exponential( p );
  else if ( !strcmp( op, "log" ) )
    r = pattern_logarithm( p );
  else if ( !strcmp( op, "simp" ) )
    r = pattern_simplify( p );
  else
    return err( "Unknown unary operation." );
  return encode( r );
}
