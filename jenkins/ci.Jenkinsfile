// CI pipeline. Unit tests from BRANCH, then Playwright against playaddatest only.
// Jenkins job script path: jenkins/ci.Jenkinsfile
// Suggested job name: ci
//
// Daily parameterized cron from 5:00 AM America/New_York, one repo per build,
// DEPLOY=false. A timer run forces DEPLOY=false again. This file never rsyncs.
// The old tessera-ci-prod Friday 2:00 AM ET read-only prod smoke is not here.
//
// aisle-sarukulu is in the dropdown so the parameter matches game and test.
// It is not in the daily cron: there is no aisle-sarukulu-ci job, and this
// pipeline will not invent a Sarukulu or production BASE_URL. Selecting it
// fails with a TODO. aisle-ci (GAME=Aisle) still uses
// https://playaddatest.duckdns.org/aisle/

import groovy.transform.Field

// =============================================================================
// STAGGER_MINUTES is the only interval knob in this file.
// Change this one number (30 -> 15 is the usual retune). It drives both:
//   * the parameterizedCron minute/hour offsets generated below
//   * the sleep between repos when a manual run sets GAME=all
// Do not hand-edit cron minutes or hours.
// aisle-sarukulu is omitted from the cron list only (see CI_CRON_REPOS).
// =============================================================================
@Field int STAGGER_MINUTES = 30

@Field List<String> GAME_REPOS = [
    'tessera',
    'Murmur',
    'classic-snake',
    'mini-sudoku',
    'zip',
    'tango',
    'chassu-rider',
    'pac-man',
    'Aisle',
    'aisle-sarukulu',
    'playadda',
]

@Field Map<String, String> REPO_URLS = [
    'tessera'         : 'https://github.com/srinikvs/tessera.git',
    'Murmur'          : 'https://github.com/srinikvs/Murmur.git',
    'classic-snake'   : 'https://github.com/srinikvs/classic-snake.git',
    'mini-sudoku'     : 'https://github.com/srinikvs/mini-sudoku.git',
    'zip'             : 'https://github.com/srinikvs/zip.git',
    'tango'           : 'https://github.com/srinikvs/tango.git',
    'chassu-rider'    : 'https://github.com/srinikvs/chassu-rider.git',
    'pac-man'         : 'https://github.com/srinikvs/pac-man.git',
    'Aisle'           : 'https://github.com/srinikvs/Aisle.git',
    'aisle-sarukulu'  : 'https://github.com/srinikvs/Aisle.git',
    'playadda'        : 'https://github.com/srinikvs/playadda.git',
]

@Field Map<String, String> BASE_URLS = [
    'tessera'        : 'https://playaddatest.duckdns.org/tessera/',
    'Murmur'         : 'https://playaddatest.duckdns.org/murmur/',
    'classic-snake'  : 'https://playaddatest.duckdns.org/classic-snake/',
    'mini-sudoku'    : 'https://playaddatest.duckdns.org/mini-sudoku/',
    'zip'            : 'https://playaddatest.duckdns.org/zip/',
    'tango'          : 'https://playaddatest.duckdns.org/tango/',
    'chassu-rider'   : 'https://playaddatest.duckdns.org/chassu-rider/',
    'pac-man'        : 'https://playaddatest.duckdns.org/pacman/',
    'Aisle'          : 'https://playaddatest.duckdns.org/aisle/',
    'playadda'       : 'https://playaddatest.duckdns.org/',
]

String scheduledCron(List<String> repos, int startHour, int startMinute, String dayOfWeek, String paramSuffix) {
    if (STAGGER_MINUTES <= 0) {
        throw new IllegalArgumentException('STAGGER_MINUTES must be a positive number of minutes.')
    }
    def lines = ['TZ=America/New_York']
    for (int i = 0; i < repos.size(); i++) {
        int total = (startHour * 60) + startMinute + (i * STAGGER_MINUTES)
        if (total >= (24 * 60)) {
            throw new IllegalArgumentException(
                "STAGGER_MINUTES=${STAGGER_MINUTES} pushes ${repos[i]} past midnight. " +
                'Lower STAGGER_MINUTES so every repo stays on the same calendar day.'
            )
        }
        int hour = total.intdiv(60)
        int minute = total % 60
        lines << String.format(
            '%d %d * * %s %%GAME=%s;%s',
            minute, hour, dayOfWeek, repos[i], paramSuffix
        )
    }
    return lines.join('\n')
}

// Daily cron order is GAME_REPOS without aisle-sarukulu. Kept as a literal so
// the cron string is built during field init, not from a later loop.
// The check below fails the load if this drifts from GAME_REPOS.
@Field List<String> CI_CRON_REPOS = [
    'tessera',
    'Murmur',
    'classic-snake',
    'mini-sudoku',
    'zip',
    'tango',
    'chassu-rider',
    'pac-man',
    'Aisle',
    'playadda',
]

@Field String CRON_SPEC = scheduledCron(CI_CRON_REPOS, 5, 0, '*', 'BRANCH=main;DEPLOY=false')
def expectedCronRepos = []
for (int cronIdx = 0; cronIdx < GAME_REPOS.size(); cronIdx++) {
    if (GAME_REPOS[cronIdx] != 'aisle-sarukulu') {
        expectedCronRepos << GAME_REPOS[cronIdx]
    }
}
if (expectedCronRepos != CI_CRON_REPOS) {
    throw new IllegalStateException('CI_CRON_REPOS must be GAME_REPOS without aisle-sarukulu, in the same order.')
}
if (!CRON_SPEC.readLines().any { it.startsWith('0 5 * * * %GAME=tessera;BRANCH=main;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep tessera at 05:00 America/New_York daily')
}
if (CRON_SPEC.contains('%GAME=aisle-sarukulu;')) {
    throw new IllegalStateException('ci cron must not schedule aisle-sarukulu')
}

properties([
    disableConcurrentBuilds(),
    parameters([
        choice(
            name: 'GAME',
            choices: (GAME_REPOS + ['all']).join('\n'),
            description: 'What to test, in this order. all (last) runs every entry above, waiting STAGGER_MINUTES between them. Daily cron skips aisle-sarukulu (no ci job, no invented BASE_URL).'
        ),
        string(name: 'BRANCH', defaultValue: 'main', description: 'Branch for unit tests and Playwright.'),
        booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Ignored. ci never deploys. A timer trigger forces this to false.'),
    ]),
    pipelineTriggers([parameterizedCron(CRON_SPEC)]),
])

boolean asBool(value) {
    return value == true || value?.toString()?.trim()?.equalsIgnoreCase('true')
}

boolean triggeredByTimer() {
    def causes = currentBuild.getBuildCauses()
    if (causes == null) {
        return false
    }
    for (def cause : causes) {
        def cls = ''
        def desc = ''
        if (cause instanceof Map) {
            cls = (cause.get('_class') ?: '').toString()
            desc = (cause.get('shortDescription') ?: '').toString()
        } else {
            cls = cause.getClass().name
        }
        if (cls.contains('TimerTrigger') || desc.toLowerCase().contains('started by timer')) {
            return true
        }
    }
    return false
}

void assertBranch(String branch) {
    if (!(branch ==~ /^[A-Za-z0-9._\/-]+$/) || branch.contains('..')) {
        error("BRANCH '${branch}' is not a plain git ref this pipeline will check out.")
    }
}

void refuseBase(String label, String baseUrl) {
    if (!baseUrl || !baseUrl.contains('playaddatest.duckdns.org')) {
        error("${label}: refusing BASE_URL '${baseUrl}'. ci only tests playaddatest.")
    }
    if (baseUrl.contains('playadda.duckdns.org') && !baseUrl.contains('playaddatest')) {
        error("${label}: prod BASE_URL forbidden on daily *-ci")
    }
}

void checkoutRepo(String url, String branch, String branchSpec) {
    deleteDir()
    checkout([$class: 'GitSCM', branches: [[name: branchSpec]], userRemoteConfigs: [[url: url]]])
    sh "git fetch origin --prune && git checkout -B ${branch} origin/${branch} && git log -1 --oneline"
}

void archiveCi(boolean excludeTrace) {
    if (excludeTrace) {
        archiveArtifacts artifacts: 'test-results/**,playwright-report/**', excludes: '**/trace.zip', allowEmptyArchive: true
    } else {
        archiveArtifacts artifacts: 'test-results/**,playwright-report/**', allowEmptyArchive: true
    }
}

void runTessera(String branch) {
    String base = BASE_URLS['tessera']
    if (base?.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
        error('tessera-ci forbids prod BASE_URL — use tessera-ci-prod for Friday 2am smoke')
    }
    refuseBase('tessera-ci', base)
    env.BASE_URL = base
    checkoutRepo(REPO_URLS['tessera'], branch, "*/${branch}")
    try {
        sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm test
'''
        sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export CI=true
export BASE_URL="https://playaddatest.duckdns.org/tessera/"
echo "Playwright against $BASE_URL (read-only; no local preview)"
npx playwright install chromium
npm run test:e2e
'''
    } finally {
        archiveCi(false)
    }
}

void runGeneric(String game, String label, String branch, boolean starSpec) {
    String base = BASE_URLS[game]
    refuseBase(label, base)
    if (base && base.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
        error("${label}: prod BASE_URL forbidden on daily *-ci")
    }
    env.E2E_BASE_URL = base
    String spec = starSpec ? "*/${branch}" : '**'
    checkoutRepo(REPO_URLS[game], branch, spec)
    try {
        sh '''
set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ ! -f package.json ]; then
  echo "No package.json — skeleton skip."
  exit 0
fi
if [ -f package-lock.json ]; then npm ci; else npm install; fi
if node -e "const s=require('./package.json').scripts||{}; process.exit(s.test?0:1)"; then
  npm test
else
  echo "No npm test — skip unit."
fi
if node -e "const s=require('./package.json').scripts||{}; process.exit(s['test:e2e']||s['test:e2e:pixel']?0:1)"; then
  npx playwright install chromium || true
  if [ -n "${E2E_BASE_URL:-}" ]; then
    export BASE_URL="$E2E_BASE_URL"
    echo "Playwright against remote $BASE_URL"
  else
    unset BASE_URL || true
    echo "Playwright local preview (BASE_URL unset)"
  fi
  if node -e "const s=require('./package.json').scripts||{}; process.exit(s['test:e2e']?0:1)"; then
    npm run test:e2e
  else
    npm run test:e2e:pixel
  fi
else
  echo "No Playwright yet — skeleton only."
fi
'''
    } finally {
        archiveCi(false)
    }
}

void runPlayadda(String branch) {
    String base = BASE_URLS['playadda']
    if (base && base.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
        error('playadda-ci: prod BASE_URL forbidden on daily *-ci')
    }
    refuseBase('playadda-ci', base)
    env.E2E_BASE_URL = base
    // Same allow-list as playadda-ci: inject the qa storage state only for the
    // playaddatest origin. Slashy form so the dots are literal.
    env.E2E_INJECT_SESSION = (base ==~ /^https:\/\/playaddatest\.duckdns\.org(\/.*)?$/) ? 'true' : 'false'
    checkoutRepo(REPO_URLS['playadda'], branch, "*/${branch}")
    def ciScript = '''set -euo pipefail
export PATH="/usr/local/lib/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ ! -f package.json ]; then
  echo "No package.json — skeleton skip."
  exit 0
fi
if [ -f package-lock.json ]; then npm ci; else npm install; fi
if node -e "const s=require('./package.json').scripts||{}; process.exit(s.test?0:1)"; then
  npm test
else
  echo "No npm test — skip unit."
fi
# prefer test:e2e then test:e2e:pixel
has_e2e=$(node -e "const s=require('./package.json').scripts||{}; process.stdout.write((s['test:e2e']||s['test:e2e:pixel'])?'1':'0')")
if [ "$has_e2e" = "1" ]; then
  npx playwright install chromium || true
  if [ -n "${E2E_BASE_URL:-}" ]; then
    export BASE_URL="$E2E_BASE_URL"
    echo "Playwright against remote $BASE_URL"
  else
    unset BASE_URL || true
    echo "Playwright local preview (BASE_URL unset)"
  fi
  if node -e "const s=require('./package.json').scripts||{}; process.exit(s['test:e2e']?0:1)"; then
    npm run test:e2e
  fi
  if node -e "const s=require('./package.json').scripts||{}; process.exit(s['test:e2e:pixel']?0:1)"; then
    npm run test:e2e:pixel
  fi
else
  echo "No Playwright yet — skeleton only."
fi
'''
    try {
        if (env.E2E_INJECT_SESSION == 'true') {
            echo 'E2E session: injected from Secret file playadda-e2e-storage-state-test (playaddatest only)'
            withCredentials([file(credentialsId: 'playadda-e2e-storage-state-test', variable: 'PLAYADDA_E2E_STORAGE_STATE')]) {
                sh ciScript
            }
        } else {
            echo 'E2E session: none (BASE_URL is not playaddatest); overlay login path unchanged'
            sh ciScript
        }
    } finally {
        archiveCi(true)
    }
}

void runGame(String game, String branch) {
    switch (game) {
        case 'tessera':
            runTessera(branch)
            break
        case 'Murmur':
            runGeneric('Murmur', 'murmur-ci', branch, true)
            break
        case 'classic-snake':
            runGeneric('classic-snake', 'classic-snake-ci', branch, true)
            break
        case 'mini-sudoku':
            runGeneric('mini-sudoku', 'mini-sudoku-ci', branch, true)
            break
        case 'zip':
            runGeneric('zip', 'zip-ci', branch, true)
            break
        case 'tango':
            runGeneric('tango', 'tango-ci', branch, true)
            break
        case 'chassu-rider':
            runGeneric('chassu-rider', 'chassu-rider-ci', branch, true)
            break
        case 'pac-man':
            runGeneric('pac-man', 'pacman-ci', branch, true)
            break
        case 'Aisle':
            runGeneric('Aisle', 'aisle-ci', branch, false)
            break
        case 'aisle-sarukulu':
            error('TODO: no ci job exists for aisle-sarukulu. aisle-ci tests https://playaddatest.duckdns.org/aisle/ under GAME=Aisle. Not inventing a Sarukulu or production BASE_URL.')
            break
        case 'playadda':
            runPlayadda(branch)
            break
        default:
            error("Unknown GAME '${game}'.")
    }
}

void runSelected(String gameParam, String branch) {
    List<String> targets = gameParam == 'all' ? GAME_REPOS : [gameParam]
    def failures = []
    for (int i = 0; i < targets.size(); i++) {
        String game = targets[i]
        if (i > 0) {
            echo "GAME=all waiting ${STAGGER_MINUTES} minutes before ${game}. Change STAGGER_MINUTES at the top of this file to retune the wait and the cron offsets together."
            sleep time: STAGGER_MINUTES, unit: 'MINUTES'
        }
        stage(game) {
            echo "=== ${game} branch=${branch} BASE_URL=${BASE_URLS[game] ?: 'n/a'} DEPLOY=false ==="
            try {
                runGame(game, branch)
            } catch (InterruptedException e) {
                throw e
            } catch (Exception e) {
                failures << game
                echo "FAILED ${game} ${env.BUILD_URL} ${e}"
            }
        }
    }
    if (!failures.isEmpty()) {
        error("Failed repo(s): ${failures.join(', ')}. See the log above.")
    }
}

timestamps {
    node {
        stage('Guard') {
            String gameParam = params?.GAME?.toString()?.trim()
            String branch = params?.BRANCH?.toString()?.trim()
            if (!branch) {
                branch = 'main'
            }
            if (!gameParam) {
                error('GAME is empty.')
            }
            if (gameParam != 'all' && !GAME_REPOS.contains(gameParam)) {
                error("Unknown GAME '${gameParam}'.")
            }
            assertBranch(branch)
            boolean timer = triggeredByTimer()
            if (timer) {
                echo 'Timer trigger: forcing DEPLOY=false. ci cron never deploys.'
            } else if (asBool(params?.DEPLOY)) {
                echo 'DEPLOY=true has no effect on ci. This pipeline only runs unit tests and Playwright against playaddatest.'
            }
            env.DO_DEPLOY = 'false'
            env.CI = 'true'
            currentBuild.displayName = "#${env.BUILD_NUMBER} ${gameParam} ${branch}"
            currentBuild.description = "GAME=${gameParam} branch=${branch} deploy=false"
            echo "Effective GAME=${gameParam} BRANCH=${branch} DEPLOY=false STAGGER_MINUTES=${STAGGER_MINUTES} timer=${timer}"
            echo "Daily parameterizedCron (generated from STAGGER_MINUTES, aisle-sarukulu omitted):\n${CRON_SPEC}"
            runSelected(gameParam, branch)
        }
    }
}
