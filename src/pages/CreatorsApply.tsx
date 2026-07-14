import React, { useState, useEffect } from 'react'
import { getCategories, submitCreatorApplication } from '../services/creatorService'
import { navigateTo } from '../App'

export default function CreatorsApply() {
  const [categoriesList, setCategoriesList] = useState<any[]>([])
  const [currentStep, setCurrentStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Fields state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [experience, setExperience] = useState('1')
  const [equipment, setEquipment] = useState('')
  const [languages, setLanguages] = useState('')

  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [instagram, setInstagram] = useState('')
  const [behance, setBehance] = useState('')
  const [dribbble, setDribbble] = useState('')
  const [youtube, setYoutube] = useState('')
  const [vimeo, setVimeo] = useState('')

  const [bio, setBio] = useState('')
  const [availability, setAvailability] = useState('available')
  const [agreement, setAgreement] = useState(false)

  useEffect(() => {
    async function loadCats() {
      try {
        const data = await getCategories()
        setCategoriesList(data)
      } catch (err) {
        console.error('Error fetching categories:', err)
      }
    }
    loadCats()
  }, [])

  const handleCategoryToggle = (slug: string) => {
    setSelectedCats(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const validateStep = (step: number) => {
    if (step === 1) {
      if (!fullName.trim() || !email.trim() || !phone.trim() || !city.trim() || !country.trim()) {
        alert('Please fill out all required fields.')
        return false
      }
    } else if (step === 2) {
      if (selectedCats.length === 0) {
        alert('Please select at least one core creative category.')
        return false
      }
      if (!equipment.trim() || !languages.trim()) {
        alert('Please describe your equipment rig and spoken languages.')
        return false
      }
    } else if (step === 3) {
      if (!portfolioUrl.trim()) {
        alert('Please enter your primary portfolio website.')
        return false
      }
    } else if (step === 4) {
      if (!bio.trim()) {
        alert('Please write your creative bio.')
        return false
      }
      if (!agreement) {
        alert('Please read and agree to the vetting select standards.')
        return false
      }
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep(4)) return

    setSubmitting(true)
    try {
      const profileData = {
        fullName,
        email,
        phone,
        city,
        country,
        categories: selectedCats,
        experience: parseInt(experience, 10),
        equipment: equipment.split(',').map(s => s.trim()).filter(Boolean),
        languages: languages.split(',').map(s => s.trim()).filter(Boolean),
        bio,
        availability,
      }

      const portfolioLinks = {
        portfolioUrl,
        instagram,
        behance,
        dribbble,
        youtube,
        vimeo,
      }

      await submitCreatorApplication(profileData, portfolioLinks, {})
      setSubmitted(true)
    } catch (err) {
      alert('Application submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    navigateTo(path)
  }

  const fillPercentage = ((currentStep - 1) / 3) * 100

  return (
    <section className="section-padding" style={{ paddingTop: '160px', minHeight: '100vh', position: 'relative' }}>
      <div className="grid-bg-overlay"></div>
      <span className="overline reveal-item" style={{ textAlign: 'center', display: 'block' }}>Network Entrance</span>
      <h1 className="heading-large reveal-item" style={{ textAlign: 'center', marginBottom: '20px' }}>Join the Collective</h1>

      <div className="apply-card reveal-item">
        {!submitted ? (
          <>
            {/* Step Indicators */}
            <div className="progress-bar-wrap">
              <div className="progress-line-track"></div>
              <div id="progress-line-fill" className="progress-line-fill" style={{ width: `${fillPercentage}%` }}></div>
              <div className={`progress-step-dot ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>1</div>
              <div className={`progress-step-dot ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>2</div>
              <div className={`progress-step-dot ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}>3</div>
              <div className={`progress-step-dot ${currentStep === 4 ? 'active' : ''}`}>4</div>
            </div>

            <form onSubmit={handleSubmit}>
              
              {/* Step 1: Basics */}
              {currentStep === 1 && (
                <div className="form-step active">
                  <h2 className="step-title">1. Professional Basics</h2>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input type="text" className="form-control" placeholder="Arjun Nair" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input type="email" className="form-control" placeholder="arjun@nair.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" className="form-control" placeholder="+91 98765 43210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label className="form-label">City</label>
                      <input type="text" className="form-control" placeholder="Kochi" required value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Country</label>
                      <input type="text" className="form-control" placeholder="India" required value={country} onChange={(e) => setCountry(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Craft */}
              {currentStep === 2 && (
                <div className="form-step active">
                  <h2 className="step-title">2. Your Craft</h2>
                  <div className="form-group">
                    <label className="form-label">Core Creative Spheres (Select All That Apply)</label>
                    <div className="checkbox-grid">
                      {categoriesList.map((cat) => (
                        <label key={cat.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            className="checkbox-input"
                            checked={selectedCats.includes(cat.slug)}
                            onChange={() => handleCategoryToggle(cat.slug)}
                          />
                          {cat.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Years of Professional Experience</label>
                    <select className="form-control" required value={experience} onChange={(e) => setExperience(e.target.value)}>
                      <option value="1">1-2 Years</option>
                      <option value="3">3-4 Years</option>
                      <option value="5">5-7 Years</option>
                      <option value="8">8-10 Years</option>
                      <option value="12">12+ Years</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Key Equipment & Rig Setup (Comma-separated)</label>
                    <textarea className="form-control" placeholder="Sony A7R V, DJI Mavic 3 Pro, prime lens kits..." required value={equipment} onChange={(e) => setEquipment(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Spoken Languages (Comma-separated)</label>
                    <input type="text" className="form-control" placeholder="English, Malayalam, Hindi" required value={languages} onChange={(e) => setLanguages(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Step 3: Presence */}
              {currentStep === 3 && (
                <div className="form-step active">
                  <h2 className="step-title">3. Digital Presence</h2>
                  <div className="form-group">
                    <label className="form-label">Primary Portfolio URL</label>
                    <input type="url" className="form-control" placeholder="https://arjunclicks.com" required value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Instagram Handle (Username Only)</label>
                    <input type="text" className="form-control" placeholder="arjun_clicks" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label className="form-label">Behance handle</label>
                      <input type="text" className="form-control" placeholder="username" value={behance} onChange={(e) => setBehance(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Dribbble handle</label>
                      <input type="text" className="form-control" placeholder="username" value={dribbble} onChange={(e) => setDribbble(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label className="form-label">YouTube Handle</label>
                      <input type="text" className="form-control" placeholder="username" value={youtube} onChange={(e) => setYoutube(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Vimeo Handle</label>
                      <input type="text" className="form-control" placeholder="username" value={vimeo} onChange={(e) => setVimeo(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: About & Availability */}
              {currentStep === 4 && (
                <div className="form-step active">
                  <h2 className="step-title">4. Scope & Availability</h2>
                  <div className="form-group">
                    <label className="form-label">Short Creative Bio / Elevator Pitch</label>
                    <textarea className="form-control" placeholder="Describe your stylistic voice, visual principles, and what campaigns you excel at..." required value={bio} onChange={(e) => setBio(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Current Availability Level</label>
                    <select className="form-control" required value={availability} onChange={(e) => setAvailability(e.target.value)}>
                      <option value="available">Available (Project-based / Retainers)</option>
                      <option value="busy">Limited Spots (Selected Campaigns Only)</option>
                      <option value="unavailable">Fully Booked (Open for future cycles)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginTop: '15px' }}>
                    <label className="checkbox-label">
                      <input type="checkbox" className="checkbox-input" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} />
                      I understand that YAWMATIC review standards are extremely selective, and listing is not guaranteed.
                    </label>
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="btn-row">
                <button
                  type="button"
                  onClick={handleBack}
                  className="btn btn--ghost"
                  style={{ opacity: currentStep === 1 ? 0 : 1, pointerEvents: currentStep === 1 ? 'none' : 'auto' }}
                >
                  Back
                </button>
                {currentStep < 4 ? (
                  <button type="button" onClick={handleNext} className="btn btn--primary">
                    Next Step
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="btn btn--primary">
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                )}
              </div>

            </form>
          </>
        ) : (
          <div className="confirmation-wrap">
            <span style={{ fontSize: '4rem', color: 'var(--fire)', display: 'block', filter: 'drop-shadow(0 0 10px rgba(255, 90, 31, 0.2))' }}>✓</span>
            <h2 className="step-title" style={{ marginBottom: '10px' }}>Application Under Review</h2>
            <p style={{ color: 'var(--mist)', lineHeight: '1.6', maxWidth: '480px', fontSize: '0.95rem', margin: '0 auto' }}>
              Thanks — your application has been received and is under review. Our team evaluates every submission personally to maintain the Collective's standards. If there is a matching project fit, we will be in touch directly.
            </p>
            <div className="magnetic-wrap" style={{ marginTop: '20px' }}>
              <a href="/creators" onClick={(e) => handleNavigate(e, '/creators')} className="btn btn--primary magnetic">Return to Collective</a>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
