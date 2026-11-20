"""Read only this study's physical controller trials and verify every decoded receipt."""
import json, statistics, sys
from pathlib import Path
from collections import defaultdict

def summarize(data, require=5):
    trials = [x for x in data['runs'] if x['name'] == 'sysmon']
    failures = [x for x in data['failures'] if str(x[1]).startswith('renderlab sysmon')]
    expect = {'G':22072,'M':8002,'A':18980}
    by_arm, by_block = defaultdict(list), defaultdict(dict)
    for trial in trials:
        d = trial['data']
        arm = d['arm']
        assert arm == trial['arm'] and d['bytes']==expect[arm] and d['checksum']==2164593678
        assert d['frames']==20 and d['reps']==1 and d['packets']==17
        d = {**d, 'combinedUs':d['producerUs']+d['receiverUs']}
        by_arm[arm].append(d)
        assert arm not in by_block[trial['block']]
        by_block[trial['block']][arm]=d
    assert len(by_block)==require and all(set(v)==set(expect) for v in by_block.values()), (len(by_block), require)
    assert not failures,failures
    metrics={}
    for arm, group in by_arm.items():
        metrics[arm] = {k:statistics.median(x[k] for x in group) for k in ['producerUs','receiverUs','combinedUs']}
        metrics[arm].update(worstProducerUs=max(x['maxProducer'] for x in group),
            worstReceiverUs=max(x['maxReceiver'] for x in group),
            combinedRangeUs=[min(x['combinedUs'] for x in group),max(x['combinedUs'] for x in group)])
        metrics[arm]['medianPairedCombinedRatio']=statistics.median(
            b[arm]['combinedUs']/b['G']['combinedUs'] for b in by_block.values())
    return {'controlFirmwareSha256':data['firmwareSha256'], 'experimentFirmwareSha256':data['experimentSha256'],
            'program':'renderLabRun(arm,1)', 'expectedChecksum':2164593678,
            'blocks':len(by_block),'summary':metrics,'trials':trials,'failures':failures}

if __name__=='__main__':
    result=summarize(json.loads(Path(sys.argv[1]).read_text()),int(sys.argv[3]) if len(sys.argv)>3 else 5)
    Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
