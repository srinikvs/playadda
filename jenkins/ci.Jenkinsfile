// CI pipeline. Unit tests from BRANCH, then Playwright. This file never rsyncs.
// Jenkins job script path: jenkins/ci.Jenkinsfile
// Suggested job name: ci
//
// TARGET=playaddatest (default) uses the playaddatest URLs below.
// TARGET=playadda runs the same tests read-only against
// https://playadda.duckdns.org/<game>/. It never deploys and never injects
// the playaddatest session. DEPLOY=true with TARGET=playadda fails at start.
//
// Daily parameterized cron from 5:00 AM America/New_York, one repo per build,
// pins TARGET=playaddatest;DEPLOY=false. A timer run of those lines forces
// TARGET=playaddatest and DEPLOY=false again.
// Friday 2:00 AM America/New_York uses the same repo list, one line per game,
// and pins TARGET=playadda;DEPLOY=false. That timer keeps DEPLOY=false and is
// the only timer allowed to keep TARGET=playadda.
//
// Aisle and aisle-sarukulu stay in the dropdown so the parameter matches
// game and test, and so Aisle can still be run by hand. Neither cron
// schedules them. aisle-sarukulu has no ci job; selecting it fails with a
// TODO. Aisle's stagger slot stays empty so every other game keeps its
// clock time. A manual Aisle run still uses aisle-ci on the chosen TARGET host.

import com.cloudbees.groovy.cps.NonCPS
import groovy.transform.Field

// =============================================================================
// STAGGER_MINUTES is the only interval knob in this file.
// Change this one number (30 -> 15 is the usual retune). It drives both:
//   * the parameterizedCron minute/hour offsets generated below
//   * the sleep between repos when a manual run sets GAME=all
// Do not hand-edit cron minutes or hours.
// Aisle and aisle-sarukulu are omitted from the cron lines (see CI_CRON_REPOS).
// Aisle remains an empty stagger slot so later clock times stay put.
// aisle-sarukulu never had a slot.
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
    'maata',
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
    'maata'           : 'https://github.com/srinikvs/maata.git',
]

// Private repos need the Jenkins GitHub credential to clone. Public repos stay anonymous.
@Field Map<String, String> REPO_CREDS = [
    'maata' : 'github-srinikvs-pat',
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
    'maata'          : 'https://playaddatest.duckdns.org/maata/',
]

// @NonCPS: CRON_SPEC calls this during field init. A CPS method cannot run
// while Jenkins is still constructing the Script instance.
@NonCPS
String scheduledCron(List<String> repos, int startHour, int startMinute, String dayOfWeek, String paramSuffix) {
    if (STAGGER_MINUTES <= 0) {
        throw new IllegalArgumentException('STAGGER_MINUTES must be a positive number of minutes.')
    }
    def lines = ['TZ=America/New_York']
    for (int i = 0; i < repos.size(); i++) {
        int total = (startHour * 60) + startMinute + (i * STAGGER_MINUTES)
        String slotName = repos[i] ? repos[i] : 'held slot'
        if (total >= (24 * 60)) {
            throw new IllegalArgumentException(
                "STAGGER_MINUTES=${STAGGER_MINUTES} pushes ${slotName} past midnight. " +
                'Lower STAGGER_MINUTES so every repo stays on the same calendar day.'
            )
        }
        int hour = total.intdiv(60)
        int minute = total % 60
        // Empty entries hold a stagger slot and emit no line (Aisle).
        if (!repos[i]) {
            continue
        }
        lines << String.format(
            '%d %d * * %s %%GAME=%s;%s',
            minute, hour, dayOfWeek, repos[i], paramSuffix
        )
    }
    return lines.join('\n')
}

// Daily cron order is GAME_REPOS without aisle-sarukulu. Aisle is an empty
// string: no cron line, and the slot still counts so later games keep the
// same clock time. Kept as a literal so the cron string is built during
// field init, not from a later loop. The check below fails the load if
// this drifts from GAME_REPOS.
// Friday 2:00 uses this same list, read-only against prod.
@Field List<String> CI_CRON_REPOS = [
    'tessera',
    'Murmur',
    'classic-snake',
    'mini-sudoku',
    'zip',
    'tango',
    'chassu-rider',
    'pac-man',
    '', // Aisle slot, not scheduled. Keeps playadda at daily 09:30 and Friday 06:30.
    'playadda',
    'maata', // daily 10:00 playaddatest, Friday 07:00 read-only playadda
]

// One TZ line. Daily lines pin playaddatest. Friday lines pin playadda.
// Both pin DEPLOY=false. Offsets come only from STAGGER_MINUTES.
@NonCPS
String ciCronSpec() {
    String daily = scheduledCron(CI_CRON_REPOS, 5, 0, '*', 'BRANCH=main;TARGET=playaddatest;DEPLOY=false')
    String friday = scheduledCron(CI_CRON_REPOS, 2, 0, '5', 'BRANCH=main;TARGET=playadda;DEPLOY=false')
    def fridayLines = []
    def fridayAll = friday.readLines()
    for (int i = 0; i < fridayAll.size(); i++) {
        if (!fridayAll[i].startsWith('TZ=')) {
            fridayLines << fridayAll[i]
        }
    }
    return daily + '\n' + fridayLines.join('\n')
}

@Field String CRON_SPEC = ciCronSpec()
def expectedCronRepos = []
for (int cronIdx = 0; cronIdx < GAME_REPOS.size(); cronIdx++) {
    String cronGame = GAME_REPOS[cronIdx]
    if (cronGame == 'aisle-sarukulu') {
        continue
    }
    // Same omission as aisle-sarukulu, but the slot stays so later times do not move.
    if (cronGame == 'Aisle') {
        expectedCronRepos << ''
        continue
    }
    expectedCronRepos << cronGame
}
if (expectedCronRepos != CI_CRON_REPOS) {
    throw new IllegalStateException('CI_CRON_REPOS must be GAME_REPOS without aisle-sarukulu, with Aisle held as an empty stagger slot, in the same order.')
}
def cronLines = CRON_SPEC.readLines()
if (!cronLines.any { it.startsWith('0 5 * * * %GAME=tessera;BRANCH=main;TARGET=playaddatest;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep tessera at 05:00 America/New_York daily on playaddatest')
}
if (!cronLines.any { it.startsWith('0 2 * * 5 %GAME=tessera;BRANCH=main;TARGET=playadda;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep tessera at Friday 02:00 America/New_York read-only on playadda')
}
if (!cronLines.any { it.startsWith('30 9 * * * %GAME=playadda;BRANCH=main;TARGET=playaddatest;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep playadda at 09:30 America/New_York daily on playaddatest')
}
if (!cronLines.any { it.startsWith('30 6 * * 5 %GAME=playadda;BRANCH=main;TARGET=playadda;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep playadda at Friday 06:30 America/New_York read-only on playadda')
}
if (!cronLines.any { it.startsWith('0 10 * * * %GAME=maata;BRANCH=main;TARGET=playaddatest;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep maata at 10:00 America/New_York daily on playaddatest')
}
if (!cronLines.any { it.startsWith('0 7 * * 5 %GAME=maata;BRANCH=main;TARGET=playadda;DEPLOY=false') }) {
    throw new IllegalStateException('ci cron must keep maata at Friday 07:00 America/New_York read-only on playadda')
}
if (CRON_SPEC.contains('%GAME=aisle-sarukulu;')) {
    throw new IllegalStateException('ci cron must not schedule aisle-sarukulu')
}
if (CRON_SPEC.contains('%GAME=Aisle;')) {
    throw new IllegalStateException('ci cron must not schedule Aisle')
}
if (CRON_SPEC.contains('%GAME=;')) {
    throw new IllegalStateException('ci cron must not emit the held Aisle slot')
}
int dailyCount = 0
int fridayCount = 0
for (int lineIdx = 0; lineIdx < cronLines.size(); lineIdx++) {
    String cronLine = cronLines[lineIdx]
    if (cronLine.startsWith('TZ=') || cronLine.trim().isEmpty()) {
        continue
    }
    if (cronLine.contains('* * 5 %')) {
        fridayCount++
        if (!cronLine.contains('TARGET=playadda;DEPLOY=false')) {
            throw new IllegalStateException("Friday ci cron line must pin TARGET=playadda;DEPLOY=false: ${cronLine}")
        }
    } else if (cronLine.contains('* * * %')) {
        dailyCount++
        if (!cronLine.contains('TARGET=playaddatest;DEPLOY=false')) {
            throw new IllegalStateException("daily ci cron line must pin TARGET=playaddatest;DEPLOY=false: ${cronLine}")
        }
    } else {
        throw new IllegalStateException("unexpected ci cron line '${cronLine}'")
    }
}
int scheduledRepoCount = 0
for (int repoIdx = 0; repoIdx < CI_CRON_REPOS.size(); repoIdx++) {
    if (CI_CRON_REPOS[repoIdx]) {
        scheduledRepoCount++
    }
}
if (dailyCount != scheduledRepoCount || fridayCount != scheduledRepoCount) {
    throw new IllegalStateException('daily and Friday ci crons must each schedule every named CI_CRON_REPOS entry once')
}

properties([
    disableConcurrentBuilds(),
    parameters([
        choice(
            name: 'GAME',
            choices: (GAME_REPOS + ['all']).join('\n'),
            description: 'What to test, in this order. all (last) runs every entry above, waiting STAGGER_MINUTES between them. Daily and Friday crons skip Aisle and aisle-sarukulu. Aisle stays in this list for a manual run. aisle-sarukulu has no ci job and no invented BASE_URL.'
        ),
        choice(
            name: 'TARGET',
            choices: 'playaddatest\nplayadda',
            description: 'playaddatest (default) tests https://playaddatest.duckdns.org/. playadda runs the same tests read-only against https://playadda.duckdns.org/ and never deploys or uses the playaddatest session. Daily 5 AM cron pins playaddatest. Friday 2 AM cron pins playadda.'
        ),
        string(name: 'BRANCH', defaultValue: 'main', description: 'Branch for unit tests and Playwright.'),
        booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Ignored on playaddatest. ci never deploys or rsyncs. DEPLOY=true with TARGET=playadda fails the build. A timer trigger forces this to false.'),
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

// playaddatest returns the map entry unchanged. playadda swaps the host only,
// so pacman, murmur, aisle, and the portal root keep today's paths.
String baseUrlFor(String game) {
    String base = BASE_URLS[game]
    if (env.CI_TARGET == 'playadda') {
        if (!base) {
            return base
        }
        return base.replace('https://playaddatest.duckdns.org', 'https://playadda.duckdns.org')
    }
    return base
}

void refuseBase(String label, String baseUrl) {
    if (env.CI_TARGET == 'playadda') {
        if (!baseUrl || !baseUrl.startsWith('https://playadda.duckdns.org/') || baseUrl.contains('playaddatest')) {
            error("${label}: refusing BASE_URL '${baseUrl}'. TARGET=playadda only tests https://playadda.duckdns.org/.")
        }
        return
    }
    if (!baseUrl || !baseUrl.contains('playaddatest.duckdns.org')) {
        error("${label}: refusing BASE_URL '${baseUrl}'. ci only tests playaddatest.")
    }
    if (baseUrl.contains('playadda.duckdns.org') && !baseUrl.contains('playaddatest')) {
        error("${label}: prod BASE_URL forbidden on daily *-ci")
    }
}

void checkoutRepo(String url, String branch, String branchSpec, String credentialsId = null) {
    deleteDir()
    def remote = [url: url]
    if (credentialsId) {
        remote.credentialsId = credentialsId
    }
    checkout([$class: 'GitSCM', branches: [[name: branchSpec]], userRemoteConfigs: [remote]])
    // GitSCM writes a plain https remote. The fetch below has no credential of
    // its own, so a private repo fails asking for a username. gitUsernamePassword
    // supplies the same Jenkins credential for that fetch only. Do not echo it.
    if (credentialsId) {
        withCredentials([gitUsernamePassword(credentialsId: credentialsId, gitToolName: 'Default')]) {
            sh "git fetch origin --prune && git checkout -B ${branch} origin/${branch} && git log -1 --oneline"
        }
    } else {
        sh "git fetch origin --prune && git checkout -B ${branch} origin/${branch} && git log -1 --oneline"
    }
}

void archiveCi(boolean excludeTrace) {
    if (excludeTrace) {
        archiveArtifacts artifacts: 'test-results/**,playwright-report/**', excludes: '**/trace.zip', allowEmptyArchive: true
    } else {
        archiveArtifacts artifacts: 'test-results/**,playwright-report/**', allowEmptyArchive: true
    }
}

void runTessera(String branch) {
    String base = baseUrlFor('tessera')
    if (env.CI_TARGET != 'playadda' && base?.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
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
export BASE_URL="''' + base + '''"
echo "Playwright against $BASE_URL (read-only; no local preview)"
npx playwright install chromium
npm run test:e2e
'''
    } finally {
        archiveCi(false)
    }
}

void runGeneric(String game, String label, String branch, boolean starSpec) {
    String base = baseUrlFor(game)
    refuseBase(label, base)
    if (env.CI_TARGET != 'playadda' && base && base.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
        error("${label}: prod BASE_URL forbidden on daily *-ci")
    }
    env.E2E_BASE_URL = base
    String spec = starSpec ? "*/${branch}" : '**'
    checkoutRepo(REPO_URLS[game], branch, spec, REPO_CREDS[game])
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
    String base = baseUrlFor('playadda')
    if (env.CI_TARGET != 'playadda' && base && base.contains('playadda.duckdns.org') && !base.contains('playaddatest')) {
        error('playadda-ci: prod BASE_URL forbidden on daily *-ci')
    }
    refuseBase('playadda-ci', base)
    env.E2E_BASE_URL = base
    // Inject the qa storage state only for the playaddatest origin, and never
    // when TARGET=playadda. Slashy form so the dots are literal.
    env.E2E_INJECT_SESSION = (env.CI_TARGET != 'playadda' && (base ==~ /^https:\/\/playaddatest\.duckdns\.org(\/.*)?$/)) ? 'true' : 'false'
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
        case 'maata':
            runGeneric('maata', 'maata-ci', branch, true)
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
            echo "=== ${game} branch=${branch} BASE_URL=${baseUrlFor(game) ?: 'n/a'} DEPLOY=false ==="
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
            String target = params?.TARGET?.toString()?.trim()
            if (!target) {
                target = 'playaddatest'
            }
            if (target != 'playaddatest' && target != 'playadda') {
                error("Unknown TARGET '${target}'.")
            }
            boolean timer = triggeredByTimer()
            boolean requestedDeploy = asBool(params?.DEPLOY)
            // A timer keeps TARGET=playadda only when this GAME is one of the
            // Friday lines (those pin TARGET=playadda;DEPLOY=false). Every
            // other timer, including the daily 5 AM lines, is forced back to
            // playaddatest. DEPLOY is always forced false on a timer.
            boolean fridayProdLine = false
            if (target == 'playadda') {
                def specLines = CRON_SPEC.readLines()
                for (int lineIdx = 0; lineIdx < specLines.size(); lineIdx++) {
                    String cronLine = specLines[lineIdx]
                    if (cronLine.contains('* * 5 %') && cronLine.contains("%GAME=${gameParam};") && cronLine.contains('TARGET=playadda;DEPLOY=false')) {
                        fridayProdLine = true
                    }
                }
            }
            if (timer) {
                if (fridayProdLine) {
                    echo 'Timer trigger: Friday read-only prod line. Forcing DEPLOY=false and keeping TARGET=playadda.'
                } else {
                    target = 'playaddatest'
                    echo 'Timer trigger: forcing TARGET=playaddatest and DEPLOY=false.'
                }
            } else if (requestedDeploy && target == 'playadda') {
                error('DEPLOY=true is refused when TARGET=playadda. ci never deploys or rsyncs.')
            } else if (requestedDeploy) {
                echo 'DEPLOY=true has no effect on ci. This pipeline only runs unit tests and Playwright against playaddatest.'
            }
            env.CI_TARGET = target
            env.DO_DEPLOY = 'false'
            env.CI = 'true'
            currentBuild.displayName = "#${env.BUILD_NUMBER} ${gameParam} ${target} ${branch}"
            currentBuild.description = "GAME=${gameParam} branch=${branch} target=${target} deploy=false"
            echo "Effective GAME=${gameParam} BRANCH=${branch} TARGET=${target} DEPLOY=false STAGGER_MINUTES=${STAGGER_MINUTES} timer=${timer}"
            echo "parameterizedCron (daily playaddatest 05:00, Friday playadda 02:00, Aisle and aisle-sarukulu omitted):\n${CRON_SPEC}"
            runSelected(gameParam, branch)
        }
    }
}
