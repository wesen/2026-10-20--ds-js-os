// Included in the disposable research command after WAMR is ready. The live kernel never owns this instance.
#include "chess_producer_modules.h"

static wasm_module_inst_t producer_instance;
static uint8_t *producer_copy;
static uint32_t producer_tree_length, producer_hint_length;
static unsigned producer_published;
bool lab_producer_intercept(wasm_exec_env_t env, int32_t op, const char *tree, uint32_t tree_n,
                            const char *hints, uint32_t hint_n, int64_t *result) {
    if (!producer_instance || wasm_runtime_get_module_inst(env) != producer_instance) return false;
    *result = 0;
    if (op == NW_KIND || op == NW_PRESENT) return true;
    if (op != NW_SCREEN || tree_n > 16384 || hint_n > 120 || !tree_n) {
        wasm_runtime_set_exception(producer_instance, "unexpected research-guest syscall or length");
        *result = -1;
        return true;
    }
    memcpy(producer_copy, tree, tree_n);
    memcpy(producer_copy + tree_n, hints, hint_n);
    producer_tree_length = tree_n;
    producer_hint_length = hint_n;
    ++producer_published;
    return true;
}

static void producer_trial(const char *arm, int reps) {
    const bool generic = !strcmp(arm, "generic");
    if (!generic && strcmp(arm, "semantic")) { puts("LAB ERROR producer arm"); return; }
    const uint8_t *code = generic ? chess_prod_generic : chess_prod_semantic;
    size_t n = generic ? sizeof chess_prod_generic : sizeof chess_prod_semantic;
    const uint32_t (*checks)[3] = generic ? chess_prod_generic_checks : chess_prod_semantic_checks;
    static const char *keys[] = {"", "left", "right", "enter", "left", "right", "esc"};
    char error[150] = "";
    uint8_t *bytes = NULL;
    wasm_module_t mod = NULL;
    wasm_exec_env_t env = NULL;
    if (!lab_wamr_ready(error, sizeof error)) goto done;
    bytes = malloc(n);
    producer_copy = malloc(16384 + 120);
    if (!bytes || !producer_copy) { strcpy(error, "producer fixture allocation"); goto done; }
    memcpy(bytes, code, n);
    mod = wasm_runtime_load(bytes, (uint32_t)n, error, sizeof error);
    if (!mod) goto done;
    InstantiationArgs inst_args = {.default_stack_size=16384, .host_managed_heap_size=0, .max_memory_pages=32};
    producer_instance = wasm_runtime_instantiate_ex(mod, &inst_args, error, sizeof error);
    if (!producer_instance) goto done;
    env = wasm_runtime_create_exec_env(producer_instance, 16384);
    wasm_function_inst_t init = wasm_runtime_lookup_function(producer_instance, "nw_wasm_init");
    wasm_function_inst_t ctor = wasm_runtime_lookup_function(producer_instance, "_initialize");
    wasm_function_inst_t buffer = wasm_runtime_lookup_function(producer_instance, "nw_wasm_buffer");
    wasm_function_inst_t event = wasm_runtime_lookup_function(producer_instance, "nw_wasm_event");
    uint32_t argv[7] = {0};
    if (!env || !init || !buffer || !event) { strcpy(error, "producer export/env missing"); goto done; }
    wasm_runtime_set_instruction_count_limit(env, 8000000);
    if ((ctor && !wasm_runtime_call_wasm(env,ctor,0,argv)) || !wasm_runtime_call_wasm(env,init,0,argv)) goto trap;
    uint64_t event_us[7] = {0};
    unsigned frames=0;
    for (int r=0; r<reps; ++r) {
        for (int k=r ? 1 : 0; k<7; ++k) {
            const char *name = k ? "key" : "", *sender = k ? "compositor" : "";
            char payload[96] = "null";
            if (k) snprintf(payload,sizeof payload,"{\"key\":\"%s\",\"ch\":\"\",\"state\":\"down\"}",keys[k]);
            size_t nn=strlen(name), pn=strlen(payload), sn=strlen(sender), total=nn+pn+sn+3;
            argv[0]=(uint32_t)total;
            wasm_runtime_set_instruction_count_limit(env, 8000000);
            if (!wasm_runtime_call_wasm(env, buffer, 1, argv)) goto trap;
            if (!argv[0] || !wasm_runtime_validate_app_addr(producer_instance,argv[0],total)) {
                strcpy(error,"producer event buffer"); goto done;
            }
            char *p=wasm_runtime_addr_app_to_native(producer_instance,argv[0]);
            memcpy(p,name,nn+1); memcpy(p+nn+1,payload,pn+1); memcpy(p+nn+pn+2,sender,sn+1);
            uint32_t args[7]={(uint32_t)(k ? 0 : 2),0,0,0,(uint32_t)nn,(uint32_t)pn,(uint32_t)sn};
            producer_published=0;
            vtime_t start=port_clock();
            if (!wasm_runtime_call_wasm(env,event,7,args)) goto trap;
            event_us[k] += port_clock()-start;
            uint32_t sum=2166136261u;
            for (uint32_t j=0;j<producer_tree_length+producer_hint_length;j++) sum=(sum^producer_copy[j])*16777619u;
            if(args[0]!=0 || producer_published!=1 || producer_tree_length!=checks[k][0] ||
               producer_hint_length!=checks[k][1] || sum!=checks[k][2]) {
                snprintf(error,sizeof error,"producer fixture %d r%d sum:%08x len:%u+%u",k,r,(unsigned)sum,(unsigned)producer_tree_length,(unsigned)producer_hint_length);
                goto done;
            }
            ++frames;
        }
    }
    printf("LAB PRODUCER %s {\"reps\":%d,\"frames\":%u,\"moduleBytes\":%u,\"sumEventUs\":[",arm,reps,frames,(unsigned)n);
    for(int k=0;k<7;k++)printf("%s%llu",k?",":"",(unsigned long long)event_us[k]);
    puts("]}");
    goto done;
trap:
    snprintf(error,sizeof error,"producer trap %.110s",wasm_runtime_get_exception(producer_instance));
done:
    if(*error) printf("LAB ERROR producer %s\n",error);
    if(env) wasm_runtime_destroy_exec_env(env);
    if(producer_instance) wasm_runtime_deinstantiate(producer_instance);
    producer_instance=NULL;
    if(mod) wasm_runtime_unload(mod);
    free(producer_copy); producer_copy=NULL;
    free(bytes);
}
