// Include immediately after binary_native.inc. Both arms start with a resident,
// bounded cJSON tree. No fixture-specific encoder specialization or cached dictionary.
typedef struct {
    const char **dict;
    int ndict, capacity, nodes, uses;
    unsigned body, string_bytes, map_stack;
} bp_plan;
static bool bp_small(double d) {
    return d >= -524288 && d <= 524287 && d == (double)(int32_t)d;
}
static int bp_slot(const bp_plan *b, const char *s) {
    int lo = 0, hi = b->ndict;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (strcmp(b->dict[mid],s) < 0) lo = mid + 1; else hi = mid;
    }
    return lo;
}
static bool bp_intern(bp_plan *b, const char *s) {
    if (!s || ++b->uses > 4096) return false;
    int i = bp_slot(b,s);
    if (i < b->ndict && !strcmp(b->dict[i],s)) return true;
    size_t len = strlen(s);
    if (len > 2048 || !bx_utf((bx_str){(const uint8_t*)s,len},NULL)) return false;
    if (b->ndict == b->capacity) {
        int cap = b->capacity ? b->capacity * 2 : 16;
        if (cap > 4096) return false;
        const char **d = realloc(b->dict, (size_t)cap*sizeof(*d));
        if (!d) return false;
        b->dict = d;
        b->capacity = cap;
    }
    memmove(b->dict+i+1,b->dict+i,(size_t)(b->ndict-i)*sizeof(*b->dict));
    b->dict[i] = s;
    b->ndict++;
    b->string_bytes += (unsigned)len;
    return true;
}
// Track peak simultaneously live object-field pointers along any recursion path.
static bool bp_size(bp_plan *b,const cJSON *j,int depth,unsigned ancestor_fields) {
    if (!j || depth > 24 || ++b->nodes > 8192) return false;
    if (cJSON_IsString(j)) return bp_intern(b,j->valuestring);
    if (cJSON_IsNumber(j)) {
        if (!isfinite(j->valuedouble)) return false;
        if (!bp_small(j->valuedouble)) b->body += 8;
        return true;
    }
    if (cJSON_IsNull(j) || cJSON_IsBool(j)) return true;
    bool map = cJSON_IsObject(j);
    if (!map && !cJSON_IsArray(j)) return false;
    unsigned count = 0;
    for (const cJSON *c=j->child; c; c=c->next)
        if (++count > (map ? 64u : 1024u)) return false;
    b->body += 2 + count*(map ? 5 : 3);
    if (b->body > 32768) return false;
    if (map) ancestor_fields += count;
    if (ancestor_fields > b->map_stack) b->map_stack = ancestor_fields;
    for (const cJSON *c=j->child; c; c=c->next) {
        if (map && !bp_intern(b,c->string)) return false;
        if (!bp_size(b,c,depth+1,ancestor_fields)) return false;
    }
    return true;
}
static void bp_u16(uint8_t *p,unsigned x) {p[0]=(uint8_t)x;p[1]=(uint8_t)(x>>8);}
static void bp_ref(uint8_t *p,unsigned tag,unsigned x) {
    p[0]=(uint8_t)x;p[1]=(uint8_t)(x>>8);p[2]=(uint8_t)((tag<<4)|((x>>16)&15));
}
static int bp_cmp_member(const void *a,const void *b) {
    const cJSON *const *left=a, *const *right=b;
    return strcmp((*left)->string,(*right)->string);
}
static bool bp_write(const bp_plan *b,const cJSON *j,uint8_t *p,unsigned slot,
                     unsigned *cursor,const cJSON **fields) {
    if (cJSON_IsNull(j)) bp_ref(p+slot,0,0);
    else if (cJSON_IsBool(j)) bp_ref(p+slot,cJSON_IsTrue(j)?2:1,0);
    else if (cJSON_IsString(j)) bp_ref(p+slot,5,(unsigned)bp_slot(b,j->valuestring));
    else if (cJSON_IsNumber(j)) {
        double d=j->valuedouble;
        if (bp_small(d)) bp_ref(p+slot,3,(uint32_t)(int32_t)d & 0xfffff);
        else {
            uint64_t bits;
            memcpy(&bits,&d,sizeof(bits));
            bp_ref(p+slot,4,*cursor);
            for (unsigned i=0;i<8;i++) p[(*cursor)++]=(uint8_t)(bits>>(8*i));
        }
    } else {
        bool map=cJSON_IsObject(j);
        unsigned n=0, start=*cursor;
        for (const cJSON *c=j->child;c;c=c->next) {
            if (map) fields[n]=c;
            n++;
        }
        if (map && n>1) qsort(fields,n,sizeof(*fields),bp_cmp_member);
        bp_ref(p+slot,map?7:6,start);
        bp_u16(p+start,n);
        *cursor += 2+n*(map?5:3);
        const cJSON *c=j->child;
        for (unsigned i=0;i<n;i++) {
            unsigned pos=start+2+i*(map?5:3);
            if (map) {
                c=fields[i];
                if(i && !strcmp(fields[i-1]->string,c->string)) return false;
                bp_u16(p+pos,(unsigned)bp_slot(b,c->string));
                pos+=2;
            }
            if (!bp_write(b,c,p,pos,cursor,map?fields+n:fields)) return false;
            if (!map) c=c->next;
        }
    }
    return true;
}
static uint8_t *bp_encode(const cJSON *tree,size_t *bytes,size_t *scratch) {
    bp_plan b={0};
    uint8_t *out=NULL;
    const cJSON **fields=NULL;
    if (!bp_size(&b,tree,0,0)) goto done;
    unsigned start=15+2*(unsigned)b.ndict;
    unsigned total=start+b.string_bytes+b.body;
    if (total>32768) goto done;
    // Allocate a non-null field base even for a scalar or an empty map.
    fields=malloc((b.map_stack?b.map_stack:1)*sizeof(*fields));
    if (!fields) goto done;
    out=malloc(total);
    if (!out) goto done;
    *scratch=(b.capacity+(b.map_stack?b.map_stack:1))*sizeof(*fields);
    memcpy(out,"PSIX\1\0",6);
    bp_u16(out+6,total);bp_u16(out+8,(unsigned)b.ndict);
    unsigned cursor=start;
    for (int i=0;i<b.ndict;i++) {
        size_t n=strlen(b.dict[i]);
        bp_u16(out+13+i*2,cursor);
        memcpy(out+cursor,b.dict[i],n);
        cursor+=(unsigned)n;
    }
    bp_u16(out+13+b.ndict*2,cursor);
    if (!bp_write(&b,tree,out,10,&cursor,fields) || cursor!=total) {
        free(out);out=NULL;
    }
    if (out) *bytes=total;
done:
    free(fields);free(b.dict);
    return out;
}
static uint32_t bp_fnv(const uint8_t *p, size_t n) {
    uint32_t h=2166136261u;
    for(size_t i=0;i<n;i++)h=(h^p[i])*16777619u;
    return h;
}
static int bp_run(const char *arm,int reps) {
    int bin=0;
    const bx_spec *s=bx_select(arm,&bin);
    if (!s || reps<1 || reps>64) return 1;
    cJSON *source=cJSON_ParseWithLength((const char*)s->json,s->nj+1);
    int nv=0,nu=0;
    if(!source || !bx_jverify(source,0,&nv,&nu) || !bx_json_shape(source,s->app)){
        cJSON_Delete(source);return 2;
    }
    uint64_t encode=0,admit=0,lookup=0,release=0;
    size_t bytes=0,scratch=0;
    uint32_t wire_hash=0,late=0,full=0;
    int status=0;
    for(int i=0;i<reps;i++) {
        uint64_t start=BX_NOW();
        uint8_t *wire=bin?bp_encode(source,&bytes,&scratch):(uint8_t*)cJSON_PrintUnformatted(source);
        if(!wire){status=3;break;}
        if(!bin)bytes=strlen((char*)wire);
        uint64_t a=BX_NOW();
        cJSON *parsed=NULL;
        bx_data b={0};
        uint8_t *owned=NULL;
        bool valid=false;
        if(bin){
            // Match the frozen receiver's admission, including its retained copy.
            owned=malloc(bytes);
            if(owned){memcpy(owned,wire,bytes);valid=bx_open(&b,owned,bytes)&&bx_shape(&b,s->app);}
        } else if(bx_json_preflight(wire,bytes)){
            const char *end=NULL;
            parsed=cJSON_ParseWithLengthOpts((char*)wire,bytes+1,&end,1);
            int values=0,uses=0;
            valid=parsed && end==(char*)wire+bytes && bx_jverify(parsed,0,&values,&uses) && bx_json_shape(parsed,s->app);
        }
        uint64_t v=BX_NOW();
        if(valid)late=bin?bx_weight(&b,bx_path(&b,s->late)):bx_jweight(bx_jpath(parsed,s->late));
        uint64_t w=BX_NOW();
        // Semantic/wire witnesses are checked separately from the measured path.
        wire_hash=bp_fnv(wire,bytes);
        if(valid)full=bin?bx_weight(&b,bx24(b.p+10)):bx_jweight(parsed);
        if(!valid || full!=s->hfull || late!=s->hlate ||
           (bin ? (bytes!=s->nb || memcmp(wire,s->bin,bytes)!=0) : !cJSON_Compare(source,parsed,1)))status=4;
        uint64_t x=BX_NOW();
        if(bin){free(owned);free(wire);}else{cJSON_Delete(parsed);cJSON_free(wire);}
        uint64_t end=BX_NOW();
        encode+=a-start;admit+=v-a;lookup+=w-v;release+=end-x;
        if(status)break;
    }
    cJSON_Delete(source);
    if(!status)printf("LAB NATIVEPROD %s {\"reps\":%d,\"bytes\":%u,\"encodeUs\":%" PRIu64 ",\"admitUs\":%" PRIu64
                      ",\"lookupUs\":%" PRIu64 ",\"releaseUs\":%" PRIu64 ",\"routeUs\":%" PRIu64
                      ",\"binaryScratchBytes\":%u,\"wireHash\":%u,\"lookupHash\":%u,\"walkHash\":%u}\n",
                      arm,reps,(unsigned)bytes,encode,admit,lookup,release,encode+admit+lookup+release,
                      (unsigned)scratch,(unsigned)wire_hash,(unsigned)late,(unsigned)full);
    return status;
}
static void bp_trial(const char *arm,int reps){
    int status=bp_run(arm,reps);
    if(status)printf("LAB ERROR nativeprod %s %d\n",arm,status);
}
